import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo } from '../../types';

export class OneInchExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  
  // 1inch API base URL
  private readonly ONEINCH_API_BASE = 'https://api.1inch.io/v5.0';
  
  // Common token addresses on different chains
  private readonly TOKEN_ADDRESSES: { [key: number]: { [key: string]: string } } = {
    1: { // Ethereum mainnet
      'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      'WBTC': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
    },
    56: { // BSC
      'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      'USDT': '0x55d398326f99059fF775485246999027B3197955',
      'BUSD': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'
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
    },
    10: { // Optimism
      'WETH': '0x4200000000000000000000000000000000000006',
      'USDC': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      'USDT': '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      'OP': '0x4200000000000000000000000000000000000042'
    }
  };

  constructor(chainId: number = 1, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    
    this.config = {
      name: '1inch',
      baseUrl: this.ONEINCH_API_BASE,
      timeout: 10000,
      rateLimit: 10
    };
    
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0'
      }
    });
  }
  
  private getChainConfig(chainId: number, rpcUrl?: string): ChainConfig {
    const defaultRpcUrls: { [key: number]: string } = {
      1: 'https://eth.llamarpc.com', // Ethereum mainnet
      56: 'https://bsc.llamarpc.com', // BSC
      137: 'https://polygon.llamarpc.com', // Polygon
      42161: 'https://arbitrum.llamarpc.com', // Arbitrum
      10: 'https://optimism.llamarpc.com' // Optimism
    };
    
    const chainTokens = this.TOKEN_ADDRESSES[chainId] || this.TOKEN_ADDRESSES[1];
    
    return {
      chainId,
      rpcUrl: rpcUrl || defaultRpcUrls[chainId] || 'https://eth.llamarpc.com',
      wethAddress: chainTokens.WETH || chainTokens.WBNB || chainTokens.WMATIC || chainTokens.WETH,
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
      56: 'bsc',
      137: 'polygon',
      42161: 'arbitrum',
      10: 'optimism'
    };
    return chainNames[chainId] || 'ethereum';
  }

  private async getQuote(fromToken: string, toToken: string, amount: string): Promise<any> {
    try {
      const chainName = this.getChainName(this.chainConfig.chainId);
      const response = await this.client.get(`/${chainName}/quote`, {
        params: {
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          amount: amount,
          slippage: '0.5' // 0.5% slippage
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting 1inch quote:', error);
      throw error;
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
          exchange: '1inch',
          success: false,
          error: `Token ${symbol} not supported on chain ${targetChainId}. Supported tokens: ${supportedTokens.join(', ')}`
        };
      }

      // Get USDC address for price reference
      const usdcAddress = this.chainConfig.usdcAddress;
      
      // Calculate amount (1 token with 18 decimals)
      const amount = '1000000000000000000'; // 1 token with 18 decimals
      
      // Get quote from 1inch API
      const quote = await this.getQuote(tokenAddress, usdcAddress, amount);
      
      if (!quote || !quote.toTokenAmount || !quote.fromTokenAmount) {
        return {
          exchange: '1inch',
          success: false,
          error: 'Invalid quote received from 1inch'
        };
      }

      // Calculate price
      const price = Number(quote.toTokenAmount) / Number(quote.fromTokenAmount);
      
      if (price <= 0) {
        return {
          exchange: '1inch',
          success: false,
          error: 'Invalid price calculated from quote'
        };
      }

      const data: PriceData = {
        exchange: '1inch',
        symbol: symbol.toUpperCase(),
        price,
        timestamp: Date.now(),
        chainId: targetChainId
      };

      return {
        exchange: '1inch',
        success: true,
        data
      };
    } catch (error: any) {
      return {
        exchange: '1inch',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
