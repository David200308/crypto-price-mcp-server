import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig } from '../../types';

export class KrakenExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;

  constructor() {
    this.config = {
      name: 'Kraken',
      baseUrl: 'https://api.kraken.com',
      timeout: 5000,
      rateLimit: 1
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
      const response = await this.client.get('/0/public/Ticker', {
        params: { pair: normalizedSymbol }
      });

      const pairData = response.data.result[Object.keys(response.data.result)[0]];
      if (pairData) {
        const data: PriceData = {
          exchange: 'Kraken',
          symbol: normalizedSymbol,
          price: parseFloat(pairData.c[0]), // Last trade closed price
          timestamp: Date.now(),
          volume24h: parseFloat(pairData.v[1]), // Volume today
          change24h: parseFloat(pairData.p[1]) // 24h price change
        };

        return {
          exchange: 'Kraken',
          success: true,
          data
        };
      } else {
        return {
          exchange: 'Kraken',
          success: false,
          error: 'No data found for symbol'
        };
      }
    } catch (error: any) {
      return {
        exchange: 'Kraken',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
