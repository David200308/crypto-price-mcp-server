export interface CryptoPriceAlertParams {
  symbol: string;
  price: number;
  exchange: string;
  currentTime: string;
  additionalInfo?: string;
}

export function generateCryptoPriceAlertHtml(params: CryptoPriceAlertParams): string {
  const { symbol, price, exchange, currentTime, additionalInfo } = params;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .price-card { background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 20px 0; text-align: center; border-left: 4px solid #28a745; }
        .price { font-size: 32px; font-weight: bold; color: #28a745; margin: 10px 0; }
        .details { color: #6c757d; margin: 5px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
        .additional-info { background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3; }
        .analysis-content { line-height: 1.6; color: #333; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .best-exchange { background-color: #d4edda; }
        .savings { color: #28a745; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">🚀 Crypto Price Alert</h1>
        </div>
        <div class="content">
          <div class="price-card">
            <h2 style="margin: 0 0 15px 0; color: #333;">${symbol}</h2>
            <div class="price">$${price.toFixed(2)}</div>
            <div class="details">Exchange: ${exchange}</div>
            <div class="details">Time: ${currentTime}</div>
          </div>
          ${additionalInfo ? `<div class="additional-info analysis-content">${additionalInfo}</div>` : ''}
        </div>
        <div class="footer">
          This alert was sent by the Crypto Price MCP Server.
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateCryptoPriceAlertText(params: CryptoPriceAlertParams): string {
  const { symbol, price, exchange, currentTime, additionalInfo } = params;
  
  return `
🚀 CRYPTO PRICE ALERT

${symbol}: $${price.toFixed(2)}
Exchange: ${exchange}
Time: ${currentTime}

${additionalInfo ? `Additional Information:\n${additionalInfo}\n` : ''}

This alert was sent by the Crypto Price MCP Server.
  `;
}

export function generateCryptoPriceAlertSubject(symbol: string, price: number): string {
  return `🚀 Crypto Price Alert: ${symbol} at $${price.toFixed(2)}`;
}
