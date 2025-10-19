import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo } from '../../types';
import { TokenAddressService } from '../../services/token-address-service';

export class JupiterExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  private tokenAddressService: TokenAddressService;
  
  // Jupiter API base URL
  private readonly JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';
  
  // Only keep essential reference tokens for price calculations
  private readonly REFERENCE_TOKENS: { [key: string]: string } = {
    'SOL': 'So11111111111111111111111111111111111111112', // Wrapped SOL
    'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // Used as price reference
  };

  constructor(chainId: number = 101, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    this.tokenAddressService = new TokenAddressService();
    
    this.config = {
      name: 'Jupiter',
      baseUrl: this.JUPITER_API_BASE,
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
      101: 'https://api.mainnet-beta.solana.com', // Solana mainnet
      102: 'https://api.devnet.solana.com', // Solana devnet
      103: 'https://api.testnet.solana.com' // Solana testnet
    };
    
    return {
      chainId,
      rpcUrl: rpcUrl || defaultRpcUrls[chainId] || 'https://api.mainnet-beta.solana.com',
      wethAddress: this.REFERENCE_TOKENS.SOL, // SOL as base token
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
    
    // For Solana tokens, we need to use a different approach since TokenAddressService is for EVM
    // For now, return null and let the error handling take care of it
    // In the future, we could implement a Solana-specific token address service
    console.warn(`Token ${symbol} not found in reference tokens. Solana token lookup not implemented yet.`);
    return null;
  }

  private async getQuote(inputMint: string, outputMint: string, amount: string): Promise<any> {
    try {
      const response = await this.client.get('/quote', {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps: 50 // 0.5% slippage
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting Jupiter quote:', error);
      throw error;
    }
  }

  async getPrice(symbol: string, chainId?: number): Promise<ExchangeResult> {
    try {
      // Use provided chainId or default to constructor's chainId
      const targetChainId = chainId || this.chainConfig.chainId;
      
      // Only support Solana (chainId 101)
      if (targetChainId !== 101) {
        return {
          exchange: 'Jupiter',
          success: false,
          error: `Jupiter only supports Solana (chainId: 101), got: ${targetChainId}`
        };
      }
      
      // Get token address
      const tokenAddress = await this.getTokenAddress(symbol);
      if (!tokenAddress) {
        return {
          exchange: 'Jupiter',
          success: false,
          error: `Token ${symbol} not found on Solana. Please check if the token exists and is supported.`
        };
      }

      // Get USDC address for price reference
      const usdcAddress = this.chainConfig.usdcAddress;
      
      // Calculate amount (1 token with 9 decimals for most Solana tokens)
      const amount = '1000000000'; // 1 token with 9 decimals
      
      // Get quote from Jupiter API
      const quote = await this.getQuote(tokenAddress, usdcAddress, amount);
      
      if (!quote || !quote.outAmount || !quote.inAmount) {
        return {
          exchange: 'Jupiter',
          success: false,
          error: 'Invalid quote received from Jupiter'
        };
      }

      // Calculate price
      const price = Number(quote.outAmount) / Number(quote.inAmount);
      
      if (price <= 0) {
        return {
          exchange: 'Jupiter',
          success: false,
          error: 'Invalid price calculated from quote'
        };
      }

      const data: PriceData = {
        exchange: 'Jupiter',
        symbol: symbol.toUpperCase(),
        price,
        timestamp: Date.now(),
        chainId: targetChainId
      };

      return {
        exchange: 'Jupiter',
        success: true,
        data
      };
    } catch (error: any) {
      return {
        exchange: 'Jupiter',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
