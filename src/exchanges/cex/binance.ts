import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig } from '../../types';

export class BinanceExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;

  constructor() {
    this.config = {
      name: 'Binance',
      baseUrl: 'https://api.binance.com',
      timeout: 5000,
      rateLimit: 1200
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
    return symbol.toUpperCase() + 'USDT';
  }

  async getPrice(symbol: string): Promise<ExchangeResult> {
    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const response = await this.client.get('/api/v3/ticker/price', {
        params: { symbol: normalizedSymbol }
      });

      const data: PriceData = {
        exchange: 'Binance',
        symbol: normalizedSymbol,
        price: parseFloat(response.data.price),
        timestamp: Date.now()
      };

      return {
        exchange: 'Binance',
        success: true,
        data
      };
    } catch (error: any) {
      return {
        exchange: 'Binance',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
