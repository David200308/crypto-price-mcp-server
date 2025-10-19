#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';
import { CryptoPriceChecker } from './crypto-checker.js';

class CryptoPriceMCPServer {
  private server: Server;
  private cryptoChecker: CryptoPriceChecker;

  constructor() {
    this.server = new Server({
      name: 'crypto-price-checker',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
      },
    });

    this.cryptoChecker = new CryptoPriceChecker();
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'get_crypto_price',
          description: 'Get the current price of a cryptocurrency across multiple exchanges (CEX and DEX)',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'The cryptocurrency symbol (e.g., BTC, ETH, SOL)',
              },
            },
            required: ['symbol'],
          },
        },
        {
          name: 'get_multiple_crypto_prices',
          description: 'Get prices for multiple cryptocurrencies across all exchanges',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Array of cryptocurrency symbols (e.g., ["BTC", "ETH", "SOL"])',
              },
            },
            required: ['symbols'],
          },
        },
        {
          name: 'list_supported_exchanges',
          description: 'List all supported exchanges (CEX and DEX)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_crypto_price': {
            const { symbol } = args as { symbol: string };
            const result = await this.cryptoChecker.getCryptoPrice(symbol);
            return this.formatSinglePriceResult(result);
          }

          case 'get_multiple_crypto_prices': {
            const { symbols } = args as { symbols: string[] };
            if (!Array.isArray(symbols) || symbols.length === 0) {
              throw new Error('Symbols array is required and cannot be empty');
            }
            const results = await this.cryptoChecker.getMultipleCryptoPrices(symbols);
            return this.formatMultiplePriceResults(results);
          }

          case 'list_supported_exchanges': {
            const exchanges = this.cryptoChecker.getSupportedExchanges();
            return {
              content: [
                {
                  type: 'text',
                  text: `Supported Exchanges:\n\nCEX (Centralized Exchanges):\n- Binance\n- OKX\n- Coinbase\n- Kraken\n\nDEX (Decentralized Exchanges):\n- Hyperliquid\n- Uniswap\n- 0x Swap\n\nTotal: ${exchanges.length} exchanges`,
                },
              ],
              isError: false,
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private formatSinglePriceResult(result: any): CallToolResult {
    const { symbol, results, averagePrice, bestPrice, worstPrice, totalExchanges, successfulExchanges } = result;

    let response = `# ${symbol} Price Check\n\n`;
    response += `**Summary:**\n`;
    response += `- Total Exchanges: ${totalExchanges}\n`;
    response += `- Successful: ${successfulExchanges}\n`;
    response += `- Success Rate: ${((successfulExchanges / totalExchanges) * 100).toFixed(1)}%\n\n`;

    if (averagePrice) {
      response += `**Price Statistics:**\n`;
      response += `- Average Price: $${averagePrice.toFixed(2)}\n`;
      response += `- Best Price: $${bestPrice?.toFixed(2)} (Lowest)\n`;
      response += `- Worst Price: $${worstPrice?.toFixed(2)} (Highest)\n`;
      response += `- Price Spread: $${((worstPrice || 0) - (bestPrice || 0)).toFixed(2)}\n\n`;
    }

    response += `**Exchange Results:**\n\n`;

    // Group by exchange type
    const cexResults = results.filter((r: any) => 
      ['binance', 'okx', 'coinbase', 'kraken'].includes(r.exchange.toLowerCase())
    );
    const dexResults = results.filter((r: any) => 
      ['hyperliquid', 'uniswap', '0x'].includes(r.exchange.toLowerCase())
    );

    if (cexResults.length > 0) {
      response += `### CEX (Centralized Exchanges)\n`;
      cexResults.forEach((result: any) => {
        if (result.success && result.data) {
          response += `✅ **${result.exchange}**: $${result.data.price.toFixed(2)}`;
          if (result.data.volume24h) {
            response += ` (24h Vol: $${result.data.volume24h.toLocaleString()})`;
          }
          if (result.data.change24h) {
            const change = result.data.change24h;
            const changeStr = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
            response += ` (24h: ${changeStr})`;
          }
          response += `\n`;
        } else {
          response += `❌ **${result.exchange}**: ${result.error}\n`;
        }
      });
      response += `\n`;
    }

    if (dexResults.length > 0) {
      response += `### DEX (Decentralized Exchanges)\n`;
      dexResults.forEach((result: any) => {
        if (result.success && result.data) {
          response += `✅ **${result.exchange}**: $${result.data.price.toFixed(2)}\n`;
        } else {
          response += `❌ **${result.exchange}**: ${result.error}\n`;
        }
      });
      response += `\n`;
    }

    if (successfulExchanges === 0) {
      response += `⚠️ **Warning**: No exchanges returned successful results for ${symbol}. Please check the symbol and try again.\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
      isError: false,
    };
  }

  private formatMultiplePriceResults(results: any[]): CallToolResult {
    let response = `# Multiple Crypto Price Check\n\n`;
    response += `**Total Cryptocurrencies:** ${results.length}\n\n`;

    results.forEach((result, index) => {
      const { symbol, successfulExchanges, totalExchanges, averagePrice, bestPrice, worstPrice } = result;
      
      response += `## ${index + 1}. ${symbol}\n`;
      response += `- Success Rate: ${successfulExchanges}/${totalExchanges} (${((successfulExchanges / totalExchanges) * 100).toFixed(1)}%)\n`;
      
      if (averagePrice) {
        response += `- Average Price: $${averagePrice.toFixed(2)}\n`;
        response += `- Price Range: $${bestPrice?.toFixed(2)} - $${worstPrice?.toFixed(2)}\n`;
      } else {
        response += `- ⚠️ No successful price data\n`;
      }
      response += `\n`;
    });

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
      isError: false,
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Crypto Price Checker MCP server running on stdio');
  }
}

const server = new CryptoPriceMCPServer();
server.run().catch(console.error);