import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo } from '../../types';
import { TokenAddressService } from '../../services/token-address-service';

export class CurveExchange {
  private provider: ethers.JsonRpcProvider;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  private tokenAddressService: TokenAddressService;
  
  // Curve Finance API base URL
  private readonly CURVE_API_BASE = 'https://api.curve.fi/api';
  
  // Only keep essential reference tokens for price calculations
  private readonly REFERENCE_TOKENS: { [key: number]: { [key: string]: string } } = {
    1: { // Ethereum mainnet
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    },
    137: { // Polygon
      'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
    },
    42161: { // Arbitrum
      'USDC': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
    }
  };

  constructor(chainId: number = 1, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    this.tokenAddressService = new TokenAddressService();
    
    this.config = {
      name: 'Curve',
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
      42161: 'https://arbitrum.llamarpc.com' // Arbitrum
    };
    
    const chainTokens = this.REFERENCE_TOKENS[chainId] || this.REFERENCE_TOKENS[1];
    
    return {
      chainId,
      rpcUrl: rpcUrl || defaultRpcUrls[chainId] || 'https://eth.llamarpc.com',
      wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH on Ethereum
      usdcAddress: chainTokens.USDC
    };
  }

  normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase();
  }

  private async getTokenAddress(symbol: string): Promise<string | null> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    // First try the reference tokens (faster)
    const chainTokens = this.REFERENCE_TOKENS[this.chainConfig.chainId] || this.REFERENCE_TOKENS[1];
    const referenceAddress = chainTokens[normalizedSymbol];
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

  private getChainName(chainId: number): string {
    const chainNames: { [key: number]: string } = {
      1: 'ethereum',
      137: 'polygon',
      42161: 'arbitrum'
    };
    return chainNames[chainId] || 'ethereum';
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

  private async getCurvePools(): Promise<any[]> {
    try {
      const chainName = this.getChainName(this.chainConfig.chainId);
      const response = await axios.get(`${this.CURVE_API_BASE}/getPools/${chainName}/main`);
      
      return response.data.data?.poolData || [];
    } catch (error) {
      console.error('Error getting Curve pools:', error);
      return [];
    }
  }

  private async findCurvePool(tokenAddress: string, usdcAddress: string): Promise<any | null> {
    try {
      const pools = await this.getCurvePools();
      
      // Look for pools that contain both tokens
      for (const pool of pools) {
        if (pool.coins && pool.coins.length >= 2) {
          const coinAddresses = pool.coins.map((coin: any) => coin.address?.toLowerCase());
          if (coinAddresses.includes(tokenAddress.toLowerCase()) && 
              coinAddresses.includes(usdcAddress.toLowerCase())) {
            return pool;
          }
        }
      }
      
      // If no direct pool found, look for pools with WETH as intermediary
      const wethAddress = this.chainConfig.wethAddress.toLowerCase();
      for (const pool of pools) {
        if (pool.coins && pool.coins.length >= 2) {
          const coinAddresses = pool.coins.map((coin: any) => coin.address?.toLowerCase());
          if (coinAddresses.includes(tokenAddress.toLowerCase()) && 
              coinAddresses.includes(wethAddress)) {
            return pool;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding Curve pool:', error);
      return null;
    }
  }

  private async getPoolPrice(pool: any, tokenAddress: string, usdcAddress: string): Promise<number | null> {
    try {
      // This is a simplified implementation
      // In a real implementation, you would need to interact with the pool contract
      // to get the actual exchange rate
      
      // For now, we'll use the pool's virtual price or a similar metric
      if (pool.virtualPrice) {
        // This is a rough approximation - real implementation would need
        // to calculate the actual exchange rate between the tokens
        return parseFloat(pool.virtualPrice);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting pool price:', error);
      return null;
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
          exchange: 'Curve',
          success: false,
          error: `Token ${symbol} not found on chain ${targetChainId}. Please check if the token exists and is supported.`
        };
      }

      // Get USDC address for price reference
      const usdcAddress = this.chainConfig.usdcAddress;
      
      // Find a Curve pool with both tokens
      const pool = await this.findCurvePool(tokenAddress, usdcAddress);
      
      if (!pool) {
        return {
          exchange: 'Curve',
          success: false,
          error: `No Curve pool found for ${symbol}/USDC or ${symbol}/WETH on chain ${targetChainId}. Curve primarily supports stablecoins and similar assets.`
        };
      }

      // Get price from the pool
      const price = await this.getPoolPrice(pool, tokenAddress, usdcAddress);
      
      if (!price || price <= 0) {
        return {
          exchange: 'Curve',
          success: false,
          error: 'Failed to get price from Curve pool'
        };
      }

      const data: PriceData = {
        exchange: 'Curve',
        symbol: symbol.toUpperCase(),
        price,
        timestamp: Date.now(),
        chainId: targetChainId,
        poolAddress: pool.address
      };

      return {
        exchange: 'Curve',
        success: true,
        data
      };
    } catch (error: any) {
      return {
        exchange: 'Curve',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
