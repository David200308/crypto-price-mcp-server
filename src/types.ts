export interface PriceData {
  exchange: string;
  symbol: string;
  price: number;
  timestamp: number;
  volume24h?: number;
  change24h?: number;
  error?: string;
  chainId?: number;
  poolAddress?: string;
  liquidity?: string;
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
  | '0x'
  | 'jupiter'
  | 'okx-dex'
  | '1inch'
  | 'pancakeswap'
  | 'curve';

export interface UniswapToken {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}

export interface PoolInfo {
  address: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  liquidity: string;
  sqrtPriceX96?: string;
}

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  uniswapV2Factory?: string;
  uniswapV3Factory?: string;
  wethAddress: string;
  usdcAddress: string;
}

export interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

export interface EmailRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
