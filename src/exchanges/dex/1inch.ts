import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo } from '../../types';
import { TokenAddressService } from '../../services/token-address-service';

export class OneInchExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  private tokenAddressService: TokenAddressService;
  
  // 1inch API base URL
  private readonly ONEINCH_API_BASE = 'https://api.1inch.io/v5.0';
  
  // Only keep essential reference tokens for price calculations
  private readonly REFERENCE_TOKENS: { [key: number]: { [key: string]: string } } = {
    1: { // Ethereum mainnet
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    },
    56: { // BSC
      'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
    },
    137: { // Polygon
      'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
    },
    42161: { // Arbitrum
      'USDC': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
    },
    10: { // Optimism
      'USDC': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'
    }
  };

  constructor(chainId: number = 1, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    this.tokenAddressService = new TokenAddressService();
    
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
    } catch (error: any) {
      console.error('Error getting 1inch quote:', error);
      // Check for specific error types
      if (error.response?.status === 400) {
        throw new Error(`Bad request to 1inch API. Token pair might not be supported.`);
      } else if (error.response?.status === 404) {
        throw new Error(`1inch API endpoint not found for chain ${this.getChainName(this.chainConfig.chainId)}.`);
      }
      throw error;
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
          exchange: '1inch',
          success: false,
          error: `Token ${symbol} not found on chain ${targetChainId}. Please check if the token exists and is supported.`
        };
      }

      // Get USDC address for price reference
      const usdcAddress = this.chainConfig.usdcAddress;
      
      // Calculate amount (1 token with 18 decimals)
      const amount = '1000000000000000000'; // 1 token with 18 decimals
      
      // Get quote from 1inch API
      const quote = await this.getQuote(tokenAddress, usdcAddress, amount);
      
      if (!quote) {
        return {
          exchange: '1inch',
          success: false,
          error: 'No quote received from 1inch. The token pair might not be supported or have insufficient liquidity.'
        };
      }

      // Handle different response formats from 1inch
      let toTokenAmount: string;
      let fromTokenAmount: string;
      
      if (quote.toTokenAmount && quote.fromTokenAmount) {
        // Standard format
        toTokenAmount = quote.toTokenAmount;
        fromTokenAmount = quote.fromTokenAmount;
      } else if (quote.dstAmount && quote.srcAmount) {
        // Alternative format
        toTokenAmount = quote.dstAmount;
        fromTokenAmount = quote.srcAmount;
      } else if (quote.outTokenAmount && quote.inTokenAmount) {
        // Another alternative format
        toTokenAmount = quote.outTokenAmount;
        fromTokenAmount = quote.inTokenAmount;
      } else {
        // Log the actual response for debugging
        console.log('1inch response format:', JSON.stringify(quote, null, 2));
        return {
          exchange: '1inch',
          success: false,
          error: `Invalid quote format received from 1inch. Expected toTokenAmount/fromTokenAmount, dstAmount/srcAmount, or outTokenAmount/inTokenAmount. Received: ${JSON.stringify(quote)}`
        };
      }

      // Calculate price
      const price = Number(toTokenAmount) / Number(fromTokenAmount);
      
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
