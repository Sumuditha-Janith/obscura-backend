import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const sendOTPEmail = async (to: string, otp: string): Promise<void> => {
    const mailOptions = {
        from: `"CINETIME" <${process.env.EMAIL_USER}>`,
        to,
        subject: "CINETIME - Email Verification OTP",
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2>Welcome to CINETIME 🎬</h2>
        <p>Your OTP for email verification is:</p>
        <h1 style="background: #1a202c; color: white; padding: 15px; text-align: center; border-radius: 8px;">
          ${otp}
        </h1>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr>
        <p style="color: #666;">© 2024 CINETIME. All rights reserved.</p>
      </div>
    `
    };

    await transporter.sendMail(mailOptions);
};

export const sendPasswordResetEmail = async (to: string, resetUrl: string): Promise<void> => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('Email credentials not configured');
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: `"CINETIME" <${process.env.EMAIL_USER}>`,
        to,
        subject: 'CINETIME - Password Reset Request',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 20px; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #e11d48; margin: 0;">🎬 CINETIME</h1>
          <p style="color: #94a3b8; margin-top: 5px;">Password Reset Request</p>
        </div>
        
        <div style="background: #1e293b; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 15px 0;">You requested to reset your password. Click the button below to proceed:</p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${resetUrl}" 
               style="background: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #94a3b8; font-size: 14px; margin: 15px 0 0 0;">
            This link will expire in 1 hour. If you didn't request this, please ignore this email.
          </p>
        </div>
        
        <div style="border-top: 1px solid #334155; padding-top: 15px; text-align: center;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} CINETIME. All rights reserved.
          </p>
        </div>
      </div>
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Password reset email sent to ${to}`);
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw new Error('Failed to send password reset email');
    }
};