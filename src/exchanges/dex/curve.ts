import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo } from '../../types';

export class CurveExchange {
  private provider: ethers.JsonRpcProvider;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  
  // Curve Finance API base URL
  private readonly CURVE_API_BASE = 'https://api.curve.fi/api';
  
  // Common token addresses on different chains
  private readonly TOKEN_ADDRESSES: { [key: number]: { [key: string]: string } } = {
    1: { // Ethereum mainnet
      'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      'WBTC': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      'CRV': '0xD533a949740bb3306d119CC777fa900bA034cd52',
      'LINK': '0x514910771AF9Ca656af840dff83E8264EcF986CA'
    },
    137: { // Polygon
      'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
    },
    42161: { // Arbitrum
      'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      'USDC': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      'ARB': '0x912CE59144191C1204E64559FE8253a0e49E6548'
    }
  };

  constructor(chainId: number = 1, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    
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
    
    const chainTokens = this.TOKEN_ADDRESSES[chainId] || this.TOKEN_ADDRESSES[1];
    
    return {
      chainId,
      rpcUrl: rpcUrl || defaultRpcUrls[chainId] || 'https://eth.llamarpc.com',
      wethAddress: chainTokens.WETH || chainTokens.WMATIC || chainTokens.WETH,
      usdcAddress: chainTokens.USDC
    };
  }

  normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase();
  }

  private getTokenAddress(symbol: string): string | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const chainTokens = this.TOKEN_ADDRESSES[this.chainConfig.chainId] || this.TOKEN_ADDRESSES[1];
    return chainTokens[normalizedSymbol] || null;
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
      const tokenAddress = this.getTokenAddress(symbol);
      if (!tokenAddress) {
        const supportedTokens = Object.keys(this.TOKEN_ADDRESSES[targetChainId] || this.TOKEN_ADDRESSES[1]);
        return {
          exchange: 'Curve',
          success: false,
          error: `Token ${symbol} not supported on chain ${targetChainId}. Supported tokens: ${supportedTokens.join(', ')}`
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
          error: `No Curve pool found for ${symbol}/USDC`
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
