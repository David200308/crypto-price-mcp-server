import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig } from '../../types';

export class HyperliquidExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;

  constructor() {
    this.config = {
      name: 'Hyperliquid',
      baseUrl: 'https://api.hyperliquid.xyz',
      timeout: 10000,
      rateLimit: 100
    };
    
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0'
      }
    });
  }

  normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase();
  }

  async getPrice(symbol: string): Promise<ExchangeResult> {
    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const response = await this.client.post('/info', {
        type: 'allMids'
      });

      if (response.data && response.data[normalizedSymbol]) {
        const data: PriceData = {
          exchange: 'Hyperliquid',
          symbol: normalizedSymbol,
          price: parseFloat(response.data[normalizedSymbol]),
          timestamp: Date.now()
        };

        return {
          exchange: 'Hyperliquid',
          success: true,
          data
        };
      } else {
        return {
          exchange: 'Hyperliquid',
          success: false,
          error: 'Symbol not found on Hyperliquid'
        };
      }
    } catch (error: any) {
      return {
        exchange: 'Hyperliquid',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
