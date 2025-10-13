import { Resend } from 'resend';
import { renderTemplate } from './template';

// Validate required environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';

if (!RESEND_API_KEY) {
  throw new Error('Missing required RESEND_API_KEY environment variable');
}

// Initialize Resend client
const resend = new Resend(RESEND_API_KEY);

/**
 * Send OTP code via email using Resend
 */
export async function sendOTPEmail(email: string, code: string): Promise<void> {
  try {
    const html = renderTemplate('otp-email', { CODE: code });
    const text = `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`;

    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: email,
      subject: 'Your Login Code',
      html,
      text,
    });

    if (error) {
      console.error('Resend API error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`OTP email sent to ${email} (ID: ${data?.id})`);
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw new Error('Failed to send verification email');
  }
}

/**
 * Verify Resend API connection on startup
 */
export async function verifyEmailConnection(): Promise<void> {
  try {
    // Resend doesn't have a health check endpoint, but we can validate the API key format
    if (!RESEND_API_KEY || !RESEND_API_KEY.startsWith('re_')) {
      throw new Error('Invalid Resend API key format (should start with "re_")');
    }
    console.log('Resend email service initialized successfully');
  } catch (error) {
    console.error('Resend initialization failed:', error);
    throw new Error('Failed to initialize Resend email service');
  }
}
