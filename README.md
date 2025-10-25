# Crypto Price MCP Server

A Model Context Protocol (MCP) server that provides cryptocurrency price checking and email alerting capabilities.

## Configuration

```json
{
  "mcpServers": {
    "crypto-price-mcp-server": {
      "command": "node",
      "args": [
        ".../crypto-price-mcp-server/dist/index.js"
      ],
      "cwd": ".../crypto-price-mcp-server",
      "env": {
        "MCP_CONFIG_PATH": ".../.cursor/mcp.json"
      },
      "resend": {
        "apiKey": "",
        "fromEmail": "",
        "fromName": "Crypto Price MCP Server"
      }
    }
  }
}
```

## Supported Exchanges

### Centralized Exchanges (CEX)

- Binance
- OKX
- Coinbase
- Kraken

### Decentralized Exchanges (DEX)

- Hyperliquid
- Uniswap
- 0x
- Jupiter
- 1inch
- PancakeSwap
- Curve
