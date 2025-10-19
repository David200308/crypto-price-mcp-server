import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig } from '../../types';

export class CoinbaseExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;

  constructor() {
    this.config = {
      name: 'Coinbase',
      baseUrl: 'https://api.exchange.coinbase.com',
      timeout: 5000,
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

  normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase() + '-USD';
  }

  async getPrice(symbol: string): Promise<ExchangeResult> {
    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const response = await this.client.get(`/products/${normalizedSymbol}/ticker`);

      const data: PriceData = {
        exchange: 'Coinbase',
        symbol: normalizedSymbol,
        price: parseFloat(response.data.price),
        timestamp: Date.now(),
        volume24h: parseFloat(response.data.volume)
      };

      return {
        exchange: 'Coinbase',
        success: true,
        data
      };
    } catch (error: any) {
      return {
        exchange: 'Coinbase',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
