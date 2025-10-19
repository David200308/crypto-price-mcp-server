import { Resend } from 'resend';
import { EmailConfig, EmailRequest, EmailResult } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

export class EmailService {
  private resend: Resend;
  private config: EmailConfig;

  constructor(config?: EmailConfig) {
    this.config = config || this.loadConfigFromFile();
    this.resend = new Resend(this.config.apiKey);
  }

  private evaluateTemplateLiterals(content: string): string {
    const currentDate = new Date().toLocaleDateString();
    const currentDateTime = new Date().toLocaleString();
    
    return content
      .replace(/\$\{new Date\(\)\.toLocaleDateString\(\)\}/g, currentDate)
      .replace(/\$\{new Date\(\)\.toLocaleString\(\)\}/g, currentDateTime);
  }

  private loadConfigFromFile(): EmailConfig {
    try {
      // First, check if API key is provided via environment variable
      if (process.env.RESEND_API_KEY) {
        return {
          apiKey: process.env.RESEND_API_KEY,
          fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
          fromName: process.env.RESEND_FROM_NAME || 'Crypto Price MCP Server',
        };
      }

      // Look for MCP config file in common locations
      const configPaths = [
        process.env.MCP_CONFIG_PATH, // Check environment variable first
        path.join(process.cwd(), 'mcp-config.json'),
        path.join(process.cwd(), '.mcp-config.json'),
        path.join(process.cwd(), 'config', 'mcp.json'),
        path.join(process.env.HOME || '', '.mcp-config.json'),
        path.join(process.env.HOME || '', '.config', 'mcp.json'),
        process.env.HOME ? path.join(process.env.HOME, '.cursor', 'mcp.json') : null,
        process.env.APPDATA ? path.join(process.env.APPDATA, 'Cursor', 'mcp.json') : null, // Windows
      ].filter(Boolean); // Remove undefined values

      let configPath: string | null = null;
      for (const configFile of configPaths) {
        if (configFile && fs.existsSync(configFile)) {
          configPath = configFile;
          break;
        }
      }

      if (!configPath) {
        throw new Error(
          'MCP config file not found. Please either:\n' +
          '1. Set RESEND_API_KEY environment variable, or\n' +
          '2. Create a config file with Resend API key in one of these locations:\n' +
          '   - ./mcp-config.json\n' +
          '   - ./.mcp-config.json\n' +
          '   - ./config/mcp.json\n' +
          '   - ~/.mcp-config.json\n' +
          '   - ~/.config/mcp.json\n' +
          '   - ~/.cursor/mcp.json (Cursor IDE)\n' +
          '   - %APPDATA%/Cursor/mcp.json (Windows)'
        );
      }

      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Check for Resend config in MCP server configuration
      let resendConfig = configData.resend;
      
      // If not found at root level, check in mcpServers configuration
      if (!resendConfig && configData.mcpServers) {
        // Look for any server that has resend config
        for (const serverName in configData.mcpServers) {
          const server = configData.mcpServers[serverName];
          if (server.resend) {
            resendConfig = server.resend;
            break;
          }
        }
      }
      
      if (!resendConfig || !resendConfig.apiKey) {
        throw new Error('Resend API key not found in MCP config file. Please add "resend": {"apiKey": "your-api-key"} to your config.');
      }

      return {
        apiKey: resendConfig.apiKey,
        fromEmail: resendConfig.fromEmail || 'noreply@example.com',
        fromName: resendConfig.fromName || 'Crypto Price MCP Server',
      };
    } catch (error: any) {
      throw new Error(`Failed to load email configuration: ${error.message}`);
    }
  }

  async sendEmail(request: EmailRequest): Promise<EmailResult> {
    try {
      // Validate required fields
      if (!request.to || !request.subject) {
        throw new Error('To and subject are required fields');
      }

      if (!request.html && !request.text) {
        throw new Error('Either html or text content is required');
      }

      // Prepare the email data
      const emailData: any = {
        from: this.config.fromName 
          ? `${this.config.fromName} <${this.config.fromEmail}>`
          : this.config.fromEmail,
        to: Array.isArray(request.to) ? request.to : [request.to],
        subject: request.subject,
      };

      // Add content (prefer HTML over text)
      if (request.html) {
        emailData.html = this.evaluateTemplateLiterals(request.html);
      } else if (request.text) {
        emailData.text = this.evaluateTemplateLiterals(request.text);
      }

      // Add optional fields
      if (request.cc) {
        emailData.cc = Array.isArray(request.cc) ? request.cc : [request.cc];
      }
      if (request.bcc) {
        emailData.bcc = Array.isArray(request.bcc) ? request.bcc : [request.bcc];
      }
      if (request.replyTo) {
        emailData.reply_to = request.replyTo;
      }

      // Send the email
      const result = await this.resend.emails.send(emailData);

      if (result.error) {
        return {
          success: false,
          error: result.error.message || 'Unknown error occurred while sending email',
        };
      }

      return {
        success: true,
        messageId: result.data?.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }

  async sendCryptoPriceAlert(
    to: string | string[],
    symbol: string,
    price: number,
    exchange: string,
    additionalInfo?: string
  ): Promise<EmailResult> {
    const subject = `🚀 Crypto Price Alert: ${symbol} at $${price.toFixed(2)}`;
    const currentTime = new Date().toLocaleString();
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .price-card { background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 20px 0; text-align: center; border-left: 4px solid #28a745; }
          .price { font-size: 32px; font-weight: bold; color: #28a745; margin: 10px 0; }
          .details { color: #6c757d; margin: 5px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
          .additional-info { background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3; }
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
            ${additionalInfo ? `<div class="additional-info"><strong>Additional Information:</strong><br>${additionalInfo}</div>` : ''}
          </div>
          <div class="footer">
            This alert was sent by the Crypto Price MCP Server.
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
🚀 CRYPTO PRICE ALERT

${symbol}: $${price.toFixed(2)}
Exchange: ${exchange}
Time: ${currentTime}

${additionalInfo ? `Additional Information:\n${additionalInfo}\n` : ''}

This alert was sent by the Crypto Price MCP Server.
    `;

    return this.sendEmail({
      to,
      subject,
      html,
      text,
    });
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.fromEmail);
  }
}
