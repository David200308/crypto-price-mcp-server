import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo, PoolInfo } from '../../types';

export class PancakeSwapExchange {
  private provider: ethers.JsonRpcProvider;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  
  // PancakeSwap V3 Factory contract addresses on different chains
  private readonly PANCAKESWAP_V3_FACTORY: { [key: number]: string } = {
    56: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865', // BSC
    1: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865', // Ethereum (if deployed)
    137: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' // Polygon (if deployed)
  };
  
  // Common token addresses on different chains
  private readonly TOKEN_ADDRESSES: { [key: number]: { [key: string]: string } } = {
    56: { // BSC
      'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      'USDT': '0x55d398326f99059fF775485246999027B3197955',
      'BUSD': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
      'CAKE': '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      'ETH': '0x2170Ed0880ac9A755fd29B2688956BD959F933F8'
    },
    1: { // Ethereum
      'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      'WBTC': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
    },
    137: { // Polygon
      'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
    }
  };

  constructor(chainId: number = 56, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    
    this.config = {
      name: 'PancakeSwap',
      baseUrl: this.chainConfig.rpcUrl,
      timeout: 10000,
      rateLimit: 100
    };
    
    this.provider = new ethers.JsonRpcProvider(this.chainConfig.rpcUrl);
  }
  
  private getChainConfig(chainId: number, rpcUrl?: string): ChainConfig {
    const defaultRpcUrls: { [key: number]: string } = {
      56: 'https://bsc.llamarpc.com', // BSC
      1: 'https://eth.llamarpc.com', // Ethereum
      137: 'https://polygon.llamarpc.com' // Polygon
    };
    
    const chainTokens = this.TOKEN_ADDRESSES[chainId] || this.TOKEN_ADDRESSES[56];
    
    return {
      chainId,
      rpcUrl: rpcUrl || defaultRpcUrls[chainId] || 'https://bsc.llamarpc.com',
      wethAddress: chainTokens.WBNB || chainTokens.WETH || chainTokens.WMATIC || chainTokens.WBNB,
      usdcAddress: chainTokens.USDC
    };
  }

  normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase();
  }

  private getTokenAddress(symbol: string): string | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const chainTokens = this.TOKEN_ADDRESSES[this.chainConfig.chainId] || this.TOKEN_ADDRESSES[56];
    return chainTokens[normalizedSymbol] || null;
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

  private async findPancakeSwapV3Pool(token0Address: string, token1Address: string, fee: number = 500): Promise<string | null> {
    try {
      const factoryAddress = this.PANCAKESWAP_V3_FACTORY[this.chainConfig.chainId];
      if (!factoryAddress) {
        return null;
      }

      // PancakeSwap V3 Factory ABI (same as Uniswap V3)
      const factoryAbi = [
        'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)'
      ];
      
      const factoryContract = new ethers.Contract(factoryAddress, factoryAbi, this.provider);
      const poolAddress = await factoryContract.getPool(token0Address, token1Address, fee);
      
      return poolAddress !== ethers.ZeroAddress ? poolAddress : null;
    } catch (error) {
      console.error('Error finding PancakeSwap V3 pool:', error);
      return null;
    }
  }

  private async getPoolInfo(poolAddress: string): Promise<PoolInfo | null> {
    try {
      // PancakeSwap V3 Pool ABI (same as Uniswap V3)
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
      const tokenAddress = this.getTokenAddress(symbol);
      if (!tokenAddress) {
        const supportedTokens = Object.keys(this.TOKEN_ADDRESSES[targetChainId] || this.TOKEN_ADDRESSES[56]);
        return {
          exchange: 'PancakeSwap',
          success: false,
          error: `Token ${symbol} not supported on chain ${targetChainId}. Supported tokens: ${supportedTokens.join(', ')}`
        };
      }

      // Get USDC address for price reference
      const usdcAddress = this.chainConfig.usdcAddress;
      
      // Try to find PancakeSwap V3 pool (token/USDC with 0.05% fee)
      const poolAddress = await this.findPancakeSwapV3Pool(tokenAddress, usdcAddress, 500);
      
      if (!poolAddress) {
        return {
          exchange: 'PancakeSwap',
          success: false,
          error: `No PancakeSwap V3 pool found for ${symbol}/USDC`
        };
      }

      // Get pool information
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        return {
          exchange: 'PancakeSwap',
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
          exchange: 'PancakeSwap',
          success: false,
          error: 'Price calculation not available'
        };
      }

      const data: PriceData = {
        exchange: 'PancakeSwap',
        symbol: symbol.toUpperCase(),
        price,
        timestamp: Date.now(),
        chainId: targetChainId,
        poolAddress: poolAddress,
        liquidity: poolInfo.liquidity
      };

      return {
        exchange: 'PancakeSwap',
        success: true,
        data
      };
    } catch (error: any) {
      return {
        exchange: 'PancakeSwap',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
