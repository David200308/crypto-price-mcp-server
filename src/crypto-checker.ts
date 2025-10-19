import { CryptoPriceResult, ExchangeResult, SupportedExchanges } from './types';
import { 
  BinanceExchange, 
  OKXExchange, 
  CoinbaseExchange, 
  KrakenExchange,
  HyperliquidExchange,
  UniswapExchange,
  ZeroXExchange
} from './exchanges';

export class CryptoPriceChecker {
  private exchanges: Map<SupportedExchanges, any> = new Map();

  constructor() {
    // Initialize CEX exchanges
    this.exchanges.set('binance', new BinanceExchange());
    this.exchanges.set('okx', new OKXExchange());
    this.exchanges.set('coinbase', new CoinbaseExchange());
    this.exchanges.set('kraken', new KrakenExchange());
    
    // Initialize DEX exchanges
    this.exchanges.set('hyperliquid', new HyperliquidExchange());
    this.exchanges.set('uniswap', new UniswapExchange());
    this.exchanges.set('0x', new ZeroXExchange());
  }

  async getCryptoPrice(symbol: string): Promise<CryptoPriceResult> {
    const results: ExchangeResult[] = [];
    const exchangeNames: SupportedExchanges[] = [
      'binance', 'okx', 'coinbase', 'kraken', 
      'hyperliquid', 'uniswap', '0x'
    ];

    // Execute all exchange queries in parallel
    const promises = exchangeNames.map(async (exchangeName) => {
      const exchange = this.exchanges.get(exchangeName);
      if (!exchange) {
        return {
          exchange: exchangeName,
          success: false,
          error: 'Exchange not found'
        };
      }

      try {
        return await exchange.getPrice(symbol);
      } catch (error: any) {
        return {
          exchange: exchangeName,
          success: false,
          error: error.message || 'Unknown error'
        };
      }
    });

    const exchangeResults = await Promise.allSettled(promises);
    
    // Process results
    exchangeResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          exchange: exchangeNames[index],
          success: false,
          error: result.reason?.message || 'Promise rejected'
        });
      }
    });

    // Calculate statistics
    const successfulResults = results.filter(r => r.success && r.data);
    const prices = successfulResults.map(r => r.data!.price);
    
    const averagePrice = prices.length > 0 
      ? prices.reduce((sum, price) => sum + price, 0) / prices.length 
      : undefined;
    
    const bestPrice = prices.length > 0 ? Math.min(...prices) : undefined;
    const worstPrice = prices.length > 0 ? Math.max(...prices) : undefined;

    return {
      symbol: symbol.toUpperCase(),
      results,
      averagePrice,
      bestPrice,
      worstPrice,
      totalExchanges: results.length,
      successfulExchanges: successfulResults.length
    };
  }

  async getMultipleCryptoPrices(symbols: string[]): Promise<CryptoPriceResult[]> {
    const promises = symbols.map(symbol => this.getCryptoPrice(symbol));
    return Promise.all(promises);
  }

  getSupportedExchanges(): SupportedExchanges[] {
    return Array.from(this.exchanges.keys());
  }

  isExchangeSupported(exchange: string): boolean {
    return this.exchanges.has(exchange as SupportedExchanges);
  }
}
