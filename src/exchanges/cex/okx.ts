import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig } from '../../types';

export class OKXExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;

  constructor() {
    this.config = {
      name: 'OKX',
      baseUrl: 'https://www.okx.com',
      timeout: 5000,
      rateLimit: 20
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
    return symbol.toUpperCase() + '-USDT';
  }

  async getPrice(symbol: string): Promise<ExchangeResult> {
    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const response = await this.client.get('/api/v5/market/ticker', {
        params: { instId: normalizedSymbol }
      });

      if (response.data.data && response.data.data.length > 0) {
        const ticker = response.data.data[0];
        const data: PriceData = {
          exchange: 'OKX',
          symbol: normalizedSymbol,
          price: parseFloat(ticker.last),
          timestamp: Date.now(),
          volume24h: parseFloat(ticker.volCcy24h),
          change24h: parseFloat(ticker.chg)
        };

        return {
          exchange: 'OKX',
          success: true,
          data
        };
      } else {
        return {
          exchange: 'OKX',
          success: false,
          error: 'No data found for symbol'
        };
      }
    } catch (error: any) {
      return {
        exchange: 'OKX',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
