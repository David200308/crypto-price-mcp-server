# Crypto Price MCP Server

A Model Context Protocol (MCP) server that provides cryptocurrency price checking and email alerting capabilities.

## Features

- Get real-time cryptocurrency prices from multiple exchanges (CEX and DEX)
- Send email alerts with professional formatting
- Support for multiple cryptocurrencies including BTC, ETH, SOL, and more
- Configurable email service using Resend

## Installation

```bash
npm install
npm run build
```

## Configuration

### Email Service Configuration

The email service can be configured in multiple ways:

#### Option 1: Environment Variables (Recommended for production)

```bash
export RESEND_API_KEY="your-resend-api-key"
export RESEND_FROM_EMAIL="noreply@yourdomain.com"
export RESEND_FROM_NAME="Crypto Price MCP Server"
```

#### Option 2: MCP Configuration File

Create a configuration file in one of these locations:

- `./mcp-config.json`
- `./.mcp-config.json`
- `./config/mcp.json`
- `~/.mcp-config.json`
- `~/.config/mcp.json`
- `~/.cursor/mcp.json` (Cursor IDE)
- `%APPDATA%/Cursor/mcp.json` (Windows)

Use the example configuration file as a template:

```bash
cp mcp-config.example.json mcp-config.json
```

Then edit `mcp-config.json` with your Resend API key:

```json
{
  "resend": {
    "apiKey": "your-resend-api-key-here",
    "fromEmail": "noreply@yourdomain.com",
    "fromName": "Crypto Price MCP Server"
  }
}
```

#### Option 3: MCP Server Configuration

If you're using this as an MCP server, you can include the configuration in your MCP servers config:

```json
{
  "mcpServers": {
    "crypto-price-mcp-server": {
      "resend": {
        "apiKey": "your-resend-api-key-here",
        "fromEmail": "noreply@yourdomain.com",
        "fromName": "Crypto Price MCP Server"
      }
    }
  }
}
```

## Usage

### Running the Server

```bash
# Development mode (stdio)
npm start

# Production mode (HTTP)
NODE_ENV=production PORT=3100 npm start
```

### Available Tools

- `get_crypto_price`: Get current price for a single cryptocurrency
- `get_multiple_crypto_prices`: Get prices for multiple cryptocurrencies
- `list_supported_exchanges`: List all supported exchanges
- `send_email`: Send a custom email
- `send_crypto_price_alert`: Send a formatted crypto price alert email

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

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## License

MIT
