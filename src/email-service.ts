import { Resend } from 'resend';
import { EmailConfig, EmailRequest, EmailResult, CryptoPriceAlertParams, GeneralEmailParams } from './types.js';
import { generateCryptoPriceAlertHtml, generateCryptoPriceAlertText, generateCryptoPriceAlertSubject } from './templates/crypto-price-alert.js';
import { generateGeneralEmailHtml, generateGeneralEmailText } from './templates/general-email.js';
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

  /**
   * Process template content by evaluating template literals and converting markdown
   */
  private processTemplateContent(content: string, convertMarkdown: boolean = false): string {
    let processedContent = this.evaluateTemplateLiterals(content);
    
    if (convertMarkdown) {
      processedContent = this.convertMarkdownToHtml(processedContent);
    }
    
    return processedContent;
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

  private convertMarkdownToHtml(markdown: string): string {
    return markdown
      // Headers
      .replace(/^### (.*$)/gim, '<h3 style="color: #333; margin: 20px 0 10px 0; font-size: 18px;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="color: #333; margin: 25px 0 15px 0; font-size: 20px; border-bottom: 2px solid #eee; padding-bottom: 5px;">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 style="color: #333; margin: 30px 0 20px 0; font-size: 24px;">$1</h1>')
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: bold;">$1</strong>')
      // Lists
      .replace(/^\d+\.\s+(.*$)/gim, '<li style="margin: 5px 0;">$1</li>')
      .replace(/^-\s+(.*$)/gim, '<li style="margin: 5px 0;">$1</li>')
      // Tables
      .replace(/\|(.+)\|/g, (match, content) => {
        const cells = content.split('|').map((cell: string) => cell.trim());
        return `<tr>${cells.map((cell: string) => `<td style="padding: 8px; border: 1px solid #ddd;">${cell}</td>`).join('')}</tr>`;
      })
      // Line breaks
      .replace(/\n\n/g, '</p><p style="margin: 10px 0;">')
      .replace(/\n/g, '<br>')
      // Wrap in paragraphs
      .replace(/^(.*)$/gm, '<p style="margin: 10px 0;">$1</p>')
      // Clean up empty paragraphs
      .replace(/<p style="margin: 10px 0;"><\/p>/g, '')
      // Clean up list items that are now in paragraphs
      .replace(/<p style="margin: 10px 0;"><li/g, '<li')
      .replace(/<\/li><\/p>/g, '</li>')
      // Wrap lists in ul/ol
      .replace(/(<li[^>]*>.*<\/li>)/gs, (match) => {
        if (match.includes('1.')) {
          return `<ol style="margin: 10px 0; padding-left: 20px;">${match}</ol>`;
        } else {
          return `<ul style="margin: 10px 0; padding-left: 20px;">${match}</ul>`;
        }
      });
  }

  async sendCryptoPriceAlert(
    to: string | string[],
    symbol: string,
    price: number,
    exchange: string,
    additionalInfo?: string
  ): Promise<EmailResult> {
    const currentTime = new Date().toLocaleString();
    
    // Prepare template parameters
    const templateParams: CryptoPriceAlertParams = {
      symbol,
      price,
      exchange,
      currentTime,
      additionalInfo: additionalInfo ? this.processTemplateContent(additionalInfo, true) : undefined
    };
    
    // Generate email content using templates
    const subject = generateCryptoPriceAlertSubject(symbol, price);
    const html = generateCryptoPriceAlertHtml(templateParams);
    const text = generateCryptoPriceAlertText(templateParams);

    return this.sendEmail({
      to,
      subject,
      html,
      text,
    });
  }

  /**
   * Send a general email using the general email template
   */
  async sendGeneralEmail(
    to: string | string[],
    subject: string,
    title: string,
    content: string,
    additionalInfo?: string,
    footerText?: string
  ): Promise<EmailResult> {
    // Prepare template parameters
    const templateParams: GeneralEmailParams = {
      title,
      content: this.processTemplateContent(content, true),
      additionalInfo: additionalInfo ? this.processTemplateContent(additionalInfo, true) : undefined,
      footerText
    };
    
    // Generate email content using templates
    const html = generateGeneralEmailHtml(templateParams);
    const text = generateGeneralEmailText(templateParams);

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
