import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo } from '../../types';
import { TokenAddressService } from '../../services/token-address-service';

export class ZeroXExchange {
  private client: AxiosInstance;
  private provider: ethers.JsonRpcProvider;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  private tokenAddressService: TokenAddressService;
  
  // 0x Protocol addresses on different chains
  private readonly ZEROX_ADDRESSES: { [key: number]: string } = {
    1: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', // Ethereum mainnet
    137: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', // Polygon
    42161: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', // Arbitrum
    10: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'  // Optimism
  };
  
  // Only keep essential reference tokens for price calculations
  private readonly REFERENCE_TOKENS: { [key: string]: string } = {
    'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // Used as price reference
  };

  constructor(chainId: number = 1, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    this.tokenAddressService = new TokenAddressService();
    
    this.config = {
      name: '0x',
      baseUrl: this.chainConfig.rpcUrl,
      timeout: 10000,
      rateLimit: 10
    };
    
    this.provider = new ethers.JsonRpcProvider(this.chainConfig.rpcUrl);
    
    // 0x API client for quote requests
    this.client = axios.create({
      baseURL: 'https://api.0x.org',
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0'
      }
    });
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

  private async getQuote(sellToken: string, buyToken: string, sellAmount: string, chainId: number): Promise<any> {
    try {
      const chainName = this.getChainName(chainId);
      const response = await this.client.get(`/swap/v1/quote`, {
        params: {
          sellToken,
          buyToken,
          sellAmount,
          chainId: chainName,
          skipValidation: true
        }
      });
      
      return response.data;
    } catch (error: any) {
      console.error('Error getting 0x quote:', error);
      // Check if it's a 404 error and provide better error message
      if (error.response?.status === 404) {
        throw new Error(`0x API endpoint not found. This might be due to unsupported chain or token pair. Status: ${error.response.status}, URL: ${error.config?.url}`);
      }
      throw error;
    }
  }

  private getChainName(chainId: number): string {
    const chainNames: { [key: number]: string } = {
      1: 'ethereum',
      137: 'polygon',
      42161: 'arbitrum',
      10: 'optimism'
    };
    return chainNames[chainId] || 'ethereum';
  }

  private calculatePriceFromQuote(quote: any, sellTokenDecimals: number, buyTokenDecimals: number): number {
    try {
      const buyAmount = BigInt(quote.buyAmount);
      const sellAmount = BigInt(quote.sellAmount);
      
      // Calculate price: buyAmount / sellAmount
      const price = Number(buyAmount) / Number(sellAmount);
      
      // Adjust for token decimals
      const decimalAdjustment = Math.pow(10, sellTokenDecimals - buyTokenDecimals);
      return price * decimalAdjustment;
    } catch (error) {
      console.error('Error calculating price from quote:', error);
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
          exchange: '0x',
          success: false,
          error: `Token ${symbol} not found on chain ${targetChainId}. Please check if the token exists and is supported.`
        };
      }

      // Get USDC address for price reference
      const usdcAddress = this.chainConfig.usdcAddress;
      
      // Get token info for decimal adjustment
      const [tokenInfo, usdcInfo] = await Promise.all([
        this.getTokenInfo(tokenAddress),
        this.getTokenInfo(usdcAddress)
      ]);
      
      if (!tokenInfo || !usdcInfo) {
        return {
          exchange: '0x',
          success: false,
          error: 'Failed to get token information'
        };
      }

      // Calculate sell amount (1 token with proper decimals)
      const sellAmount = ethers.parseUnits('1', tokenInfo.decimals).toString();
      
      // Get quote from 0x API
      const quote = await this.getQuote(tokenAddress, usdcAddress, sellAmount, targetChainId);
      
      if (!quote || !quote.buyAmount || !quote.sellAmount) {
        return {
          exchange: '0x',
          success: false,
          error: 'Invalid quote received from 0x. The token pair might not be supported or have insufficient liquidity.'
        };
      }

      // Calculate price
      const price = this.calculatePriceFromQuote(quote, tokenInfo.decimals, usdcInfo.decimals);
      
      if (price <= 0) {
        return {
          exchange: '0x',
          success: false,
          error: 'Invalid price calculated from quote'
        };
      }

      const data: PriceData = {
        exchange: '0x',
        symbol: symbol.toUpperCase(),
        price,
        timestamp: Date.now(),
        chainId: targetChainId
      };

      return {
        exchange: '0x',
        success: true,
        data
      };
    } catch (error: any) {
      return {
        exchange: '0x',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
