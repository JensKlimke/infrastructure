import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// Validate required SMTP environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
  throw new Error(
    'Missing required SMTP environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS'
  );
}

// Create reusable transporter
const transporter: Transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/**
 * Send OTP code via email
 */
export async function sendOTPEmail(email: string, code: string): Promise<void> {
  const mailOptions = {
    from: SMTP_FROM,
    to: email,
    subject: 'Your Login Code',
    text: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px;
            border-radius: 12px;
          }
          .content {
            background: white;
            padding: 30px;
            border-radius: 8px;
          }
          .code {
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #667eea;
            text-align: center;
            padding: 20px;
            margin: 20px 0;
            background: #f7fafc;
            border-radius: 8px;
            font-family: monospace;
          }
          .footer {
            margin-top: 20px;
            font-size: 14px;
            color: #718096;
            text-align: center;
          }
          h1 {
            color: #1a202c;
            margin-top: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h1>Your Login Code</h1>
            <p>Enter this code to complete your login:</p>
            <div class="code">${code}</div>
            <p>This code will expire in <strong>10 minutes</strong>.</p>
            <div class="footer">
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw new Error('Failed to send verification email');
  }
}

/**
 * Verify SMTP connection on startup
 */
export async function verifyEmailConnection(): Promise<void> {
  try {
    await transporter.verify();
    console.log('SMTP connection verified successfully');
  } catch (error) {
    console.error('SMTP connection failed:', error);
    throw new Error('Failed to connect to SMTP server');
  }
}
