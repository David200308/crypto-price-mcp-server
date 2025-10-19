import { CryptoPriceResult, ExchangeResult, SupportedExchanges } from './types';
import { 
  BinanceExchange, 
  OKXExchange, 
  CoinbaseExchange, 
  KrakenExchange,
  HyperliquidExchange,
  UniswapExchange,
  ZeroXExchange,
  JupiterExchange,
  OKXDEXExchange,
  OneInchExchange,
  PancakeSwapExchange,
  CurveExchange
} from './exchanges';

export class CryptoPriceChecker {
  private exchanges: Map<SupportedExchanges, any> = new Map();
  private chainId: number;

  constructor(chainId: number = 1) {
    this.chainId = chainId;
    
    // Initialize CEX exchanges
    this.exchanges.set('binance', new BinanceExchange());
    this.exchanges.set('okx', new OKXExchange());
    this.exchanges.set('coinbase', new CoinbaseExchange());
    this.exchanges.set('kraken', new KrakenExchange());
    
    // Initialize DEX exchanges with chainId
    this.exchanges.set('hyperliquid', new HyperliquidExchange());
    this.exchanges.set('uniswap', new UniswapExchange(chainId));
    this.exchanges.set('0x', new ZeroXExchange(chainId));
    this.exchanges.set('jupiter', new JupiterExchange(101)); // Solana
    this.exchanges.set('okx-dex', new OKXDEXExchange(chainId));
    this.exchanges.set('1inch', new OneInchExchange(chainId));
    this.exchanges.set('pancakeswap', new PancakeSwapExchange(56)); // BSC
    this.exchanges.set('curve', new CurveExchange(chainId));
  }

  async getCryptoPrice(symbol: string, chainId?: number): Promise<CryptoPriceResult> {
    const results: ExchangeResult[] = [];
    const exchangeNames: SupportedExchanges[] = [
      'binance', 'okx', 'coinbase', 'kraken', 
      'hyperliquid', 'uniswap', '0x', 'jupiter', 
      'okx-dex', '1inch', 'pancakeswap', 'curve'
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
        // Pass chainId to DEX exchanges
        if (['uniswap', '0x', 'okx-dex', '1inch', 'curve'].includes(exchangeName)) {
          return await exchange.getPrice(symbol, chainId || this.chainId);
        } else if (exchangeName === 'jupiter') {
          // Jupiter uses Solana (chainId: 101)
          return await exchange.getPrice(symbol, 101);
        } else if (exchangeName === 'pancakeswap') {
          // PancakeSwap uses BSC (chainId: 56)
          return await exchange.getPrice(symbol, 56);
        } else {
          return await exchange.getPrice(symbol);
        }
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

  async getMultipleCryptoPrices(symbols: string[], chainId?: number): Promise<CryptoPriceResult[]> {
    const promises = symbols.map(symbol => this.getCryptoPrice(symbol, chainId));
    return Promise.all(promises);
  }

  getSupportedExchanges(): SupportedExchanges[] {
    return Array.from(this.exchanges.keys());
  }

  isExchangeSupported(exchange: string): boolean {
    return this.exchanges.has(exchange as SupportedExchanges);
  }
}
