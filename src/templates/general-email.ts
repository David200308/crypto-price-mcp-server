export interface GeneralEmailParams {
  title: string;
  content: string;
  additionalInfo?: string;
  footerText?: string;
}

export function generateGeneralEmailHtml(params: GeneralEmailParams): string {
  const { title, content, additionalInfo, footerText = 'This email was sent by the Crypto Price MCP Server.' } = params;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .main-content { line-height: 1.6; color: #333; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
        .additional-info { background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3; }
        .analysis-content { line-height: 1.6; color: #333; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">${title}</h1>
        </div>
        <div class="content">
          <div class="main-content">${content}</div>
          ${additionalInfo ? `<div class="additional-info analysis-content">${additionalInfo}</div>` : ''}
        </div>
        <div class="footer">
          ${footerText}
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateGeneralEmailText(params: GeneralEmailParams): string {
  const { title, content, additionalInfo, footerText = 'This email was sent by the Crypto Price MCP Server.' } = params;
  
  return `
${title}

${content}

${additionalInfo ? `Additional Information:\n${additionalInfo}\n` : ''}

${footerText}
  `;
}
