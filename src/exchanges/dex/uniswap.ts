import { ethers } from 'ethers';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo, PoolInfo } from '../../types';
import { TokenAddressService } from '../../services/token-address-service';

export class UniswapExchange {
  private provider: ethers.JsonRpcProvider;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  private tokenAddressService: TokenAddressService;
  
  // Uniswap V3 Factory contract address on Ethereum mainnet
  private readonly UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
  private readonly UNISWAP_V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
  
  // Only keep essential reference tokens for price calculations
  private readonly REFERENCE_TOKENS: { [key: string]: string } = {
    'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // Used as price reference
  };
  
  constructor(chainId: number = 1, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    this.tokenAddressService = new TokenAddressService();
    
    this.config = {
      name: 'Uniswap',
      baseUrl: this.chainConfig.rpcUrl,
      timeout: 10000,
      rateLimit: 100
    };
    
    this.provider = new ethers.JsonRpcProvider(this.chainConfig.rpcUrl);
  }
  
  private getChainConfig(chainId: number, rpcUrl?: string): ChainConfig {
    const defaultRpcUrls: { [key: number]: string } = {
      1: 'https://eth.llamarpc.com', // Ethereum mainnet
      137: 'https://polygon.llamarpc.com', // Polygon
      42161: 'https://arbitrum.llamarpc.com', // Arbitrum
      10: 'https://optimism.llamarpc.com' // Optimism
    };
    
    return {
      chainId,
      rpcUrl: rpcUrl || defaultRpcUrls[chainId] || 'https://eth.llamarpc.com',
      uniswapV3Factory: chainId === 1 ? this.UNISWAP_V3_FACTORY : undefined,
      uniswapV2Factory: chainId === 1 ? this.UNISWAP_V2_FACTORY : undefined,
      wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH on Ethereum
      usdcAddress: this.REFERENCE_TOKENS.USDC
    };
  }

  normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase();
  }

  private async getTokenAddress(symbol: string): Promise<string | null> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    // First try the reference tokens (faster)
    const referenceAddress = this.REFERENCE_TOKENS[normalizedSymbol];
    if (referenceAddress) {
      return referenceAddress;
    }
    
    // If not found, try the token address service for EVM tokens
    try {
      const tokenResult = await this.tokenAddressService.getTokenAddress(normalizedSymbol, this.chainConfig.chainId);
      if (tokenResult.success && tokenResult.data) {
        return tokenResult.data.address;
      }
    } catch (error) {
      console.warn(`Failed to get token address for ${symbol}:`, error);
    }
    
    return null;
  }

  private async getTokenInfo(address: string): Promise<TokenInfo | null> {
    try {
      // ERC20 ABI for basic token info
      const erc20Abi = [
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function name() view returns (string)'
      ];
      
      const tokenContract = new ethers.Contract(address, erc20Abi, this.provider);
      
      const [symbol, decimals, name] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.name()
      ]);
      
      return {
        address,
        symbol,
        decimals: Number(decimals),
        name
      };
    } catch (error) {
      console.error(`Error getting token info for ${address}:`, error);
      return null;
    }
  }

  private async findUniswapV3Pool(token0Address: string, token1Address: string, fee: number = 3000): Promise<string | null> {
    try {
      if (!this.chainConfig.uniswapV3Factory) {
        return null;
      }

      // Uniswap V3 Factory ABI
      const factoryAbi = [
        'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)'
      ];
      
      const factoryContract = new ethers.Contract(this.chainConfig.uniswapV3Factory, factoryAbi, this.provider);
      const poolAddress = await factoryContract.getPool(token0Address, token1Address, fee);
      
      return poolAddress !== ethers.ZeroAddress ? poolAddress : null;
    } catch (error) {
      console.error('Error finding Uniswap V3 pool:', error);
      return null;
    }
  }

  private async getPoolInfo(poolAddress: string): Promise<PoolInfo | null> {
    try {
      // Uniswap V3 Pool ABI
      const poolAbi = [
        'function token0() view returns (address)',
        'function token1() view returns (address)',
        'function fee() view returns (uint24)',
        'function liquidity() view returns (uint128)',
        'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
      ];
      
      const poolContract = new ethers.Contract(poolAddress, poolAbi, this.provider);
      
      const [token0Address, token1Address, fee, liquidity, slot0] = await Promise.all([
        poolContract.token0(),
        poolContract.token1(),
        poolContract.fee(),
        poolContract.liquidity(),
        poolContract.slot0()
      ]);
      
      const [token0, token1] = await Promise.all([
        this.getTokenInfo(token0Address),
        this.getTokenInfo(token1Address)
      ]);
      
      if (!token0 || !token1) {
        return null;
      }
      
      return {
        address: poolAddress,
        token0,
        token1,
        fee: Number(fee),
        liquidity: liquidity.toString(),
        sqrtPriceX96: slot0[0].toString()
      };
    } catch (error) {
      console.error('Error getting pool info:', error);
      return null;
    }
  }

  private calculatePriceFromSqrtPriceX96(sqrtPriceX96: string, token0Decimals: number, token1Decimals: number): number {
    try {
      const sqrtPrice = BigInt(sqrtPriceX96);
      const Q96 = BigInt(2) ** BigInt(96);
      
      // Price = (sqrtPriceX96 / 2^96)^2
      const price = Number(sqrtPrice) / Number(Q96);
      const priceSquared = price * price;
      
      // Adjust for token decimals: price = (token1/token0) * 10^(token0Decimals - token1Decimals)
      const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
      return priceSquared * decimalAdjustment;
    } catch (error) {
      console.error('Error calculating price from sqrtPriceX96:', error);
      return 0;
    }
  }

  async getPrice(symbol: string, chainId?: number): Promise<ExchangeResult> {
    try {
      // Use provided chainId or default to constructor's chainId
      const targetChainId = chainId || this.chainConfig.chainId;
      
      // Get token address
      const tokenAddress = await this.getTokenAddress(symbol);
      if (!tokenAddress) {
        return {
          exchange: 'Uniswap',
          success: false,
          error: `Token ${symbol} not found on chain ${targetChainId}. Please check if the token exists and is supported.`
        };
      }

      // Get USDC address for price reference
      const usdcAddress = this.chainConfig.usdcAddress;
      
      // Try to find Uniswap V3 pool (token/USDC with 0.3% fee)
      const poolAddress = await this.findUniswapV3Pool(tokenAddress, usdcAddress, 3000);
      
      if (!poolAddress) {
        return {
          exchange: 'Uniswap',
          success: false,
          error: `No Uniswap V3 pool found for ${symbol}/USDC`
        };
      }

      // Get pool information
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        return {
          exchange: 'Uniswap',
          success: false,
          error: 'Failed to get pool information'
        };
      }

      // Calculate price
      let price: number;
      if (poolInfo.sqrtPriceX96) {
        // Determine which token is token0 and which is token1
        const isToken0 = poolInfo.token0.address.toLowerCase() === tokenAddress.toLowerCase();
        const tokenDecimals = isToken0 ? poolInfo.token0.decimals : poolInfo.token1.decimals;
        const usdcDecimals = isToken0 ? poolInfo.token1.decimals : poolInfo.token0.decimals;
        
        const rawPrice = this.calculatePriceFromSqrtPriceX96(
          poolInfo.sqrtPriceX96,
          tokenDecimals,
          usdcDecimals
        );
        
        // If token is token1, we need to invert the price
        price = isToken0 ? rawPrice : 1 / rawPrice;
      } else {
        return {
          exchange: 'Uniswap',
          success: false,
          error: 'Price calculation not available'
        };
      }

      const data: PriceData = {
        exchange: 'Uniswap',
        symbol: symbol.toUpperCase(),
        price,
        timestamp: Date.now(),
        chainId: targetChainId,
        poolAddress: poolAddress,
        liquidity: poolInfo.liquidity
      };

      return {
        exchange: 'Uniswap',
        success: true,
        data
      };
    } catch (error: any) {
      return {
        exchange: 'Uniswap',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
