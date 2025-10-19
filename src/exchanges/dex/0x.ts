import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { PriceData, ExchangeResult, ExchangeConfig, ChainConfig, TokenInfo } from '../../types';

export class ZeroXExchange {
  private client: AxiosInstance;
  private provider: ethers.JsonRpcProvider;
  private config: ExchangeConfig;
  private chainConfig: ChainConfig;
  
  // 0x Protocol addresses on different chains
  private readonly ZEROX_ADDRESSES: { [key: number]: string } = {
    1: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', // Ethereum mainnet
    137: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', // Polygon
    42161: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', // Arbitrum
    10: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'  // Optimism
  };
  
  // Common token addresses on Ethereum mainnet
  private readonly TOKEN_ADDRESSES: { [key: string]: string } = {
    'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    'WBTC': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    'UNI': '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
  };

  constructor(chainId: number = 1, rpcUrl?: string) {
    this.chainConfig = this.getChainConfig(chainId, rpcUrl);
    
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
      wethAddress: this.TOKEN_ADDRESSES.WETH,
      usdcAddress: this.TOKEN_ADDRESSES.USDC
    };
  }

  normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase();
  }

  private getTokenAddress(symbol: string): string | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    return this.TOKEN_ADDRESSES[normalizedSymbol] || null;
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
          chainId: chainName
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting 0x quote:', error);
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
      const tokenAddress = this.getTokenAddress(symbol);
      if (!tokenAddress) {
        return {
          exchange: '0x',
          success: false,
          error: `Token ${symbol} not supported. Supported tokens: ${Object.keys(this.TOKEN_ADDRESSES).join(', ')}`
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
          error: 'Invalid quote received from 0x'
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
