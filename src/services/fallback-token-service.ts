import axios, { AxiosInstance } from 'axios';

export interface TokenInfo {
  address: string;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  source: string;
}

export class FallbackTokenService {
  private coingeckoClient: AxiosInstance;
  private tokenListsClient: AxiosInstance;

  // Popular token lists
  private readonly TOKEN_LISTS: { [key: number]: string[] } = {
    1: [ // Ethereum
      'https://tokens.uniswap.org/',
      'https://raw.githubusercontent.com/compound-finance/token-list/master/compound.tokenlist.json',
      'https://raw.githubusercontent.com/1inch/tokenlists/main/1inch.json'
    ],
    56: [ // BSC
      'https://tokens.pancakeswap.finance/pancakeswap-extended.json',
      'https://raw.githubusercontent.com/pancakeswap/pancake-toolkit/master/packages/token-list/src/lists/pancakeswap-default.json'
    ],
    137: [ // Polygon
      'https://unpkg.com/@quickswap/sdk@latest/dist/constants/tokenLists/polygon.json',
      'https://raw.githubusercontent.com/0xPolygon/tokenlists/main/aeb.tokenlist.json'
    ],
    42161: [ // Arbitrum
      'https://bridge.arbitrum.io/token-list-42161.json'
    ],
    10: [ // Optimism
      'https://static.optimism.io/optimism.tokenlist.json'
    ]
  };

  // Chain mappings for CoinGecko
  private readonly CHAIN_MAPPINGS: { [key: number]: string } = {
    1: 'ethereum',
    56: 'binance-smart-chain',
    137: 'polygon-pos',
    42161: 'arbitrum-one',
    10: 'optimistic-ethereum',
    250: 'fantom',
    43114: 'avalanche',
    25: 'cronos',
    100: 'xdai'
  };

  constructor() {
    this.coingeckoClient = axios.create({
      baseURL: 'https://api.coingecko.com/api/v3',
      timeout: 10000,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0'
      }
    });

    this.tokenListsClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'CryptoPriceChecker/1.0.0'
      }
    });
  }

  /**
   * Get token address using multiple fallback methods
   */
  async getTokenAddress(symbol: string, chainId: number): Promise<TokenInfo | null> {
    const normalizedSymbol = symbol.toUpperCase();

    try {
      // Method 1: Try CoinGecko (no API key required for basic info)
      const coingeckoResult = await this.getFromCoinGecko(normalizedSymbol, chainId);
      if (coingeckoResult) {
        return coingeckoResult;
      }

      // Method 2: Try token lists
      const tokenListResult = await this.getFromTokenLists(normalizedSymbol, chainId);
      if (tokenListResult) {
        return tokenListResult;
      }

      // Method 3: Try common token addresses (fallback)
      const commonResult = this.getFromCommonTokens(normalizedSymbol, chainId);
      if (commonResult) {
        return commonResult;
      }

      return null;
    } catch (error) {
      console.error(`Error getting token address for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get token from CoinGecko (free tier)
   */
  private async getFromCoinGecko(symbol: string, chainId: number): Promise<TokenInfo | null> {
    try {
      const chainName = this.CHAIN_MAPPINGS[chainId];
      if (!chainName) {
        return null;
      }

      // Search for token
      const searchResponse = await this.coingeckoClient.get('/search', {
        params: { query: symbol }
      });

      if (!searchResponse.data?.coins?.length) {
        return null;
      }

      // Find exact match
      const token = searchResponse.data.coins.find((coin: any) => 
        coin.symbol.toUpperCase() === symbol.toUpperCase()
      );

      if (!token) {
        return null;
      }

      // Get token details
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
        source: 'coingecko'
      };

    } catch (error: any) {
      console.warn(`CoinGecko failed for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get token from token lists
   */
  private async getFromTokenLists(symbol: string, chainId: number): Promise<TokenInfo | null> {
    try {
      const tokenLists = this.TOKEN_LISTS[chainId];
      if (!tokenLists) {
        return null;
      }

      // Try each token list
      for (const listUrl of tokenLists) {
        try {
          const response = await this.tokenListsClient.get(listUrl);
          const tokenList = response.data;

          if (!tokenList?.tokens?.length) {
            continue;
          }

          // Find token by symbol
          const token = tokenList.tokens.find((t: any) => 
            t.symbol?.toUpperCase() === symbol.toUpperCase() &&
            t.chainId === chainId
          );

          if (token) {
            return {
              address: token.address,
              chainId: token.chainId,
              symbol: token.symbol.toUpperCase(),
              name: token.name,
              decimals: token.decimals || 18,
              source: `tokenlist-${listUrl.split('/').pop()}`
            };
          }
        } catch (error: any) {
          console.warn(`Token list ${listUrl} failed:`, error.message);
          continue;
        }
      }

      return null;
    } catch (error: any) {
      console.warn(`Token lists failed for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get token from common token addresses (hardcoded fallback)
   */
  private getFromCommonTokens(symbol: string, chainId: number): TokenInfo | null {
    const commonTokens: { [chainId: number]: { [symbol: string]: TokenInfo } } = {
      1: { // Ethereum
        'WETH': {
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          chainId: 1,
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18,
          source: 'common'
        },
        'USDC': {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          chainId: 1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          source: 'common'
        },
        'USDT': {
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          chainId: 1,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
          source: 'common'
        },
        'DAI': {
          address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          chainId: 1,
          symbol: 'DAI',
          name: 'Dai Stablecoin',
          decimals: 18,
          source: 'common'
        },
        'WBTC': {
          address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
          chainId: 1,
          symbol: 'WBTC',
          name: 'Wrapped BTC',
          decimals: 8,
          source: 'common'
        },
        'UNI': {
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          chainId: 1,
          symbol: 'UNI',
          name: 'Uniswap',
          decimals: 18,
          source: 'common'
        },
        'LINK': {
          address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
          chainId: 1,
          symbol: 'LINK',
          name: 'ChainLink Token',
          decimals: 18,
          source: 'common'
        },
        'AAVE': {
          address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
          chainId: 1,
          symbol: 'AAVE',
          name: 'Aave Token',
          decimals: 18,
          source: 'common'
        },
        'CRV': {
          address: '0xD533a949740bb3306d119CC777fa900bA034cd52',
          chainId: 1,
          symbol: 'CRV',
          name: 'Curve DAO Token',
          decimals: 18,
          source: 'common'
        },
        'MKR': {
          address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
          chainId: 1,
          symbol: 'MKR',
          name: 'Maker',
          decimals: 18,
          source: 'common'
        }
      },
      56: { // BSC
        'WBNB': {
          address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
          chainId: 56,
          symbol: 'WBNB',
          name: 'Wrapped BNB',
          decimals: 18,
          source: 'common'
        },
        'USDC': {
          address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          chainId: 56,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 18,
          source: 'common'
        },
        'USDT': {
          address: '0x55d398326f99059fF775485246999027B3197955',
          chainId: 56,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 18,
          source: 'common'
        },
        'BUSD': {
          address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
          chainId: 56,
          symbol: 'BUSD',
          name: 'BUSD Token',
          decimals: 18,
          source: 'common'
        },
        'CAKE': {
          address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
          chainId: 56,
          symbol: 'CAKE',
          name: 'PancakeSwap Token',
          decimals: 18,
          source: 'common'
        },
        'LINK': {
          address: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
          chainId: 56,
          symbol: 'LINK',
          name: 'ChainLink Token',
          decimals: 18,
          source: 'common'
        }
      },
      137: { // Polygon
        'WMATIC': {
          address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
          chainId: 137,
          symbol: 'WMATIC',
          name: 'Wrapped Matic',
          decimals: 18,
          source: 'common'
        },
        'USDC': {
          address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
          chainId: 137,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          source: 'common'
        },
        'USDT': {
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          chainId: 137,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
          source: 'common'
        },
        'DAI': {
          address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
          chainId: 137,
          symbol: 'DAI',
          name: 'Dai Stablecoin',
          decimals: 18,
          source: 'common'
        },
        'LINK': {
          address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
          chainId: 137,
          symbol: 'LINK',
          name: 'ChainLink Token',
          decimals: 18,
          source: 'common'
        }
      },
      42161: { // Arbitrum
        'WETH': {
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          chainId: 42161,
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18,
          source: 'common'
        },
        'USDC': {
          address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          chainId: 42161,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          source: 'common'
        },
        'USDT': {
          address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
          chainId: 42161,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
          source: 'common'
        },
        'ARB': {
          address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
          chainId: 42161,
          symbol: 'ARB',
          name: 'Arbitrum',
          decimals: 18,
          source: 'common'
        },
        'LINK': {
          address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
          chainId: 42161,
          symbol: 'LINK',
          name: 'ChainLink Token',
          decimals: 18,
          source: 'common'
        }
      },
      10: { // Optimism
        'WETH': {
          address: '0x4200000000000000000000000000000000000006',
          chainId: 10,
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18,
          source: 'common'
        },
        'USDC': {
          address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
          chainId: 10,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          source: 'common'
        },
        'USDT': {
          address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
          chainId: 10,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
          source: 'common'
        },
        'OP': {
          address: '0x4200000000000000000000000000000000000042',
          chainId: 10,
          symbol: 'OP',
          name: 'Optimism',
          decimals: 18,
          source: 'common'
        },
        'LINK': {
          address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
          chainId: 10,
          symbol: 'LINK',
          name: 'ChainLink Token',
          decimals: 18,
          source: 'common'
        }
      }
    };

    const chainTokens = commonTokens[chainId];
    if (!chainTokens) {
      return null;
    }

    return chainTokens[symbol] || null;
  }

  /**
   * Get multiple token addresses
   */
  async getMultipleTokenAddresses(symbols: string[], chainId: number): Promise<Map<string, TokenInfo | null>> {
    const results = new Map<string, TokenInfo | null>();
    
    // Process in parallel
    const promises = symbols.map(async (symbol) => {
      const result = await this.getTokenAddress(symbol, chainId);
      results.set(symbol, result);
    });

    await Promise.all(promises);
    return results;
  }
}
