export interface PriceData {
  exchange: string;
  symbol: string;
  price: number;
  timestamp: number;
  volume24h?: number;
  change24h?: number;
  error?: string;
}

export interface ExchangeResult {
  exchange: string;
  success: boolean;
  data?: PriceData;
  error?: string;
}

export interface CryptoPriceResult {
  symbol: string;
  results: ExchangeResult[];
  averagePrice?: number;
  bestPrice?: number;
  worstPrice?: number;
  totalExchanges: number;
  successfulExchanges: number;
}

export interface ExchangeConfig {
  name: string;
  baseUrl: string;
  timeout: number;
  rateLimit: number;
}

export type SupportedExchanges = 
  | 'binance' 
  | 'okx' 
  | 'coinbase' 
  | 'kraken' 
  | 'hyperliquid' 
  | 'uniswap' 
  | '0x';

export interface UniswapToken {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
}
