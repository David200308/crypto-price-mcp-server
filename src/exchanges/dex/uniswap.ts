import axios, { AxiosInstance } from 'axios';
import { PriceData, ExchangeResult, ExchangeConfig } from '../../types';

export class UniswapExchange {
  private client: AxiosInstance;
  private config: ExchangeConfig;
  private readonly UNISWAP_V3_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
  private readonly UNISWAP_V2_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2';
  
  constructor() {
    this.config = {
      name: 'Uniswap',
      baseUrl: 'https://api.thegraph.com',
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
      // First try to find the token by symbol
      const tokenQuery = `
        query {
          tokens(where: {symbol: "${symbol.toUpperCase()}"}) {
            id
            symbol
            name
            decimals
          }
        }
      `;

      const tokenResponse = await this.client.post(this.UNISWAP_V3_SUBGRAPH, {
        query: tokenQuery
      });

      if (!tokenResponse.data.data.tokens || tokenResponse.data.data.tokens.length === 0) {
        return {
          exchange: 'Uniswap',
          success: false,
          error: `Token ${symbol} not found on Uniswap`
        };
      }

      const token = tokenResponse.data.data.tokens[0];
      
      // Get price from USDC pair
      const priceQuery = `
        query {
          token(id: "${token.id}") {
            derivedUSD
          }
        }
      `;

      const priceResponse = await this.client.post(this.UNISWAP_V3_SUBGRAPH, {
        query: priceQuery
      });

      if (priceResponse.data.data.token && priceResponse.data.data.token.derivedUSD) {
        const data: PriceData = {
          exchange: 'Uniswap',
          symbol: symbol.toUpperCase(),
          price: parseFloat(priceResponse.data.data.token.derivedUSD),
          timestamp: Date.now()
        };

        return {
          exchange: 'Uniswap',
          success: true,
          data
        };
      } else {
        return {
          exchange: 'Uniswap',
          success: false,
          error: 'Price data not available'
        };
      }
    } catch (error: any) {
      return {
        exchange: 'Uniswap',
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}
