import axios, { AxiosInstance } from 'axios';

export interface TokenAddressInfo {
  address: string;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  source: string;
  verified: boolean;
}

export interface TokenAddressResult {
  success: boolean;
  data?: TokenAddressInfo;
  error?: string;
  sources: string[];
}

export class TokenAddressService {
  private coingeckoClient: AxiosInstance;
  private coinmarketcapClient: AxiosInstance;
  private moralisClient: AxiosInstance;
  private etherscanClient: AxiosInstance;

  // Chain ID mappings
  private readonly CHAIN_MAPPINGS = {
    // CoinGecko chain IDs
    coingecko: {
      1: 'ethereum',
      56: 'binance-smart-chain',
      137: 'polygon-pos',
      42161: 'arbitrum-one',
      10: 'optimistic-ethereum',
      250: 'fantom',
      43114: 'avalanche',
      25: 'cronos',
      100: 'xdai',
      1284: 'moonbeam',
      1285: 'moonriver'
    } as { [key: number]: string },
    // CoinMarketCap chain IDs
    coinmarketcap: {
      1: 1,
      56: 1839,
      137: 3890,
      42161: 42161,
      10: 10,
      250: 250,
      43114: 43114,
      25: 200,
      100: 100,
      1284: 1284,
      1285: 1285
    } as { [key: number]: number },
    // Moralis chain IDs
    moralis: {
      1: 'eth',
      56: 'bsc',
      137: 'polygon',
      42161: 'arbitrum',
      10: 'optimism',
      250: 'fantom',
      43114: 'avalanche',
      25: 'cronos',
      100: 'xdai',
      1284: 'moonbeam',
      1285: 'moonriver'
    } as { [key: number]: string }
  };

  constructor() {
    // CoinGecko API client
    this.coingeckoClient = axios.create({
      baseURL: 'https://api.coingecko.com/api/v3',
      timeout: 10000,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0'
      }
    });

    // CoinMarketCap API client
    this.coinmarketcapClient = axios.create({
      baseURL: 'https://pro-api.coinmarketcap.com/v1',
      timeout: 10000,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0',
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY || ''
      }
    });

    // Moralis API client
    this.moralisClient = axios.create({
      baseURL: 'https://deep-index.moralis.io/api/v2',
      timeout: 10000,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0',
        'X-API-Key': process.env.MORALIS_API_KEY || ''
      }
    });

    // Etherscan API client
    this.etherscanClient = axios.create({
      baseURL: 'https://api.etherscan.io/api',
      timeout: 10000,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0'
      }
    });
  }

  /**
   * Get token address from multiple sources with verification
   */
  async getTokenAddress(symbol: string, chainId: number): Promise<TokenAddressResult> {
    const normalizedSymbol = symbol.toUpperCase();
    const sources: string[] = [];
    const results: TokenAddressInfo[] = [];

    try {
      // Try CoinGecko first (most reliable and free)
      try {
        const coingeckoResult = await this.getFromCoinGecko(normalizedSymbol, chainId);
        if (coingeckoResult) {
          results.push(coingeckoResult);
          sources.push('coingecko');
        }
      } catch (error: any) {
        console.warn(`CoinGecko failed for ${symbol}:`, error.message);
      }

      // Try CoinMarketCap if API key is available
      if (process.env.COINMARKETCAP_API_KEY) {
        try {
          const cmcResult = await this.getFromCoinMarketCap(normalizedSymbol, chainId);
          if (cmcResult) {
            results.push(cmcResult);
            sources.push('coinmarketcap');
          }
        } catch (error: any) {
          console.warn(`CoinMarketCap failed for ${symbol}:`, error.message);
        }
      }

      // Try Moralis if API key is available
      if (process.env.MORALIS_API_KEY) {
        try {
          const moralisResult = await this.getFromMoralis(normalizedSymbol, chainId);
          if (moralisResult) {
            results.push(moralisResult);
            sources.push('moralis');
          }
        } catch (error: any) {
          console.warn(`Moralis failed for ${symbol}:`, error.message);
        }
      }

      // Try Etherscan for Ethereum mainnet
      if (chainId === 1) {
        try {
          const etherscanResult = await this.getFromEtherscan(normalizedSymbol);
          if (etherscanResult) {
            results.push(etherscanResult);
            sources.push('etherscan');
          }
        } catch (error: any) {
          console.warn(`Etherscan failed for ${symbol}:`, error.message);
        }
      }

      // Verify results and return the most reliable one
      if (results.length === 0) {
        return {
          success: false,
          error: `No token address found for ${symbol} on chain ${chainId}`,
          sources
        };
      }

      // If we have multiple results, verify they match
      const verifiedResult = this.verifyAndSelectBestResult(results, normalizedSymbol, chainId);
      
      return {
        success: true,
        data: verifiedResult,
        sources
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        sources
      };
    }
  }

  /**
   * Get token address from CoinGecko
   */
  private async getFromCoinGecko(symbol: string, chainId: number): Promise<TokenAddressInfo | null> {
    try {
      const chainName = this.CHAIN_MAPPINGS.coingecko[chainId];
      if (!chainName) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
      }

      // First, search for the token
      const searchResponse = await this.coingeckoClient.get('/search', {
        params: { query: symbol }
      });

      if (!searchResponse.data?.coins?.length) {
        return null;
      }

      // Find the best match
      const token = searchResponse.data.coins.find((coin: any) => 
        coin.symbol.toUpperCase() === symbol.toUpperCase()
      );

      if (!token) {
        return null;
      }

      // Get detailed token info
      const tokenResponse = await this.coingeckoClient.get(`/coins/${token.id}`, {
        params: {
          localization: false,
          tickers: false,
          market_data: false,
          community_data: false,
          developer_data: false,
          sparkline: false
        }
      });

      const tokenData = tokenResponse.data;
      const platformData = tokenData.platforms?.[chainName];

      if (!platformData?.contract_address) {
        return null;
      }

      return {
        address: platformData.contract_address,
        chainId,
        symbol: tokenData.symbol.toUpperCase(),
        name: tokenData.name,
        decimals: platformData.decimal_place || 18,
        source: 'coingecko',
        verified: true
      };

    } catch (error: any) {
      throw new Error(`CoinGecko API error: ${error.message}`);
    }
  }

  /**
   * Get token address from CoinMarketCap
   */
  private async getFromCoinMarketCap(symbol: string, chainId: number): Promise<TokenAddressInfo | null> {
    try {
      const cmcChainId = this.CHAIN_MAPPINGS.coinmarketcap[chainId];
      if (!cmcChainId) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
      }

      const response = await this.coinmarketcapClient.get('/cryptocurrency/map', {
        params: {
          symbol: symbol,
          listing_status: 'active'
        }
      });

      if (!response.data?.data?.length) {
        return null;
      }

      // Find the token with matching symbol
      const token = response.data.data.find((t: any) => 
        t.symbol.toUpperCase() === symbol.toUpperCase()
      );

      if (!token) {
        return null;
      }

      // Get token details
      const detailsResponse = await this.coinmarketcapClient.get('/cryptocurrency/info', {
        params: {
          id: token.id,
          aux: 'platform'
        }
      });

      const tokenDetails = detailsResponse.data.data[token.id];
      const platform = tokenDetails.platform;

      if (!platform || !platform.token_address) {
        return null;
      }

      return {
        address: platform.token_address,
        chainId,
        symbol: token.symbol.toUpperCase(),
        name: token.name,
        decimals: 18, // Default, would need additional API call for exact decimals
        source: 'coinmarketcap',
        verified: true
      };

    } catch (error: any) {
      throw new Error(`CoinMarketCap API error: ${error.message}`);
    }
  }

  /**
   * Get token address from Moralis
   */
  private async getFromMoralis(symbol: string, chainId: number): Promise<TokenAddressInfo | null> {
    try {
      const moralisChain = this.CHAIN_MAPPINGS.moralis[chainId];
      if (!moralisChain) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
      }

      const response = await this.moralisClient.get(`/erc20`, {
        params: {
          chain: moralisChain,
          limit: 100
        }
      });

      if (!response.data?.result?.length) {
        return null;
      }

      // Find token by symbol
      const token = response.data.result.find((t: any) => 
        t.symbol?.toUpperCase() === symbol.toUpperCase()
      );

      if (!token) {
        return null;
      }

      return {
        address: token.address,
        chainId,
        symbol: token.symbol.toUpperCase(),
        name: token.name,
        decimals: token.decimals,
        source: 'moralis',
        verified: true
      };

    } catch (error: any) {
      throw new Error(`Moralis API error: ${error.message}`);
    }
  }

  /**
   * Get token address from Etherscan
   */
  private async getFromEtherscan(symbol: string): Promise<TokenAddressInfo | null> {
    try {
      const response = await this.etherscanClient.get('', {
        params: {
          module: 'token',
          action: 'tokenlist',
          apikey: process.env.ETHERSCAN_API_KEY || ''
        }
      });

      if (!response.data?.result?.length) {
        return null;
      }

      // Find token by symbol
      const token = response.data.result.find((t: any) => 
        t.symbol?.toUpperCase() === symbol.toUpperCase()
      );

      if (!token) {
        return null;
      }

      return {
        address: token.address,
        chainId: 1,
        symbol: token.symbol.toUpperCase(),
        name: token.name,
        decimals: parseInt(token.decimals) || 18,
        source: 'etherscan',
        verified: true
      };

    } catch (error: any) {
      throw new Error(`Etherscan API error: ${error.message}`);
    }
  }

  /**
   * Verify multiple results and select the best one
   */
  private verifyAndSelectBestResult(results: TokenAddressInfo[], symbol: string, chainId: number): TokenAddressInfo {
    // If only one result, return it
    if (results.length === 1) {
      return results[0];
    }

    // Group by address
    const addressGroups = new Map<string, TokenAddressInfo[]>();
    results.forEach(result => {
      const key = result.address.toLowerCase();
      if (!addressGroups.has(key)) {
        addressGroups.set(key, []);
      }
      addressGroups.get(key)!.push(result);
    });

    // Find the address with the most confirmations
    let bestAddress = '';
    let maxConfirmations = 0;

    for (const [address, confirmations] of addressGroups) {
      if (confirmations.length > maxConfirmations) {
        bestAddress = address;
        maxConfirmations = confirmations.length;
      }
    }

    // Return the result with the most confirmations
    const bestResults = addressGroups.get(bestAddress)!;
    
    // Prefer results from more reliable sources
    const sourcePriority = ['coingecko', 'coinmarketcap', 'moralis', 'etherscan'];
    const sortedResults = bestResults.sort((a, b) => {
      const aIndex = sourcePriority.indexOf(a.source);
      const bIndex = sourcePriority.indexOf(b.source);
      return aIndex - bIndex;
    });

    return sortedResults[0];
  }

  /**
   * Get multiple token addresses at once
   */
  async getMultipleTokenAddresses(symbols: string[], chainId: number): Promise<Map<string, TokenAddressResult>> {
    const results = new Map<string, TokenAddressResult>();
    
    // Process in parallel with rate limiting
    const promises = symbols.map(async (symbol) => {
      const result = await this.getTokenAddress(symbol, chainId);
      results.set(symbol, result);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Check if a token address is valid for a given chain
   */
  async validateTokenAddress(address: string, chainId: number): Promise<boolean> {
    try {
      // Basic validation
      if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return false;
      }

      // Could add additional validation like checking if contract exists
      // For now, just return true if format is valid
      return true;
    } catch (error: any) {
      return false;
    }
  }
}
