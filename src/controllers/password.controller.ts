import { Request, Response } from "express";
import { User } from "../models/User";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendPasswordResetEmail } from "../utils/mailer";
import dotenv from "dotenv";
dotenv.config();

export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ message: "Email is required" });
      return;
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      res.status(200).json({ 
        message: "If an account exists with this email, you will receive a password reset link" 
      });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendPasswordResetEmail(user.email, resetUrl);

    res.status(200).json({ 
      message: "Password reset link sent to your email",
      token: process.env.NODE_ENV === "development" ? resetToken : undefined
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
};

export const verifyResetToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    
    if (!token) {
      res.status(400).json({ message: "Token is required" });
      return;
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      res.status(400).json({ message: "Invalid or expired token" });
      return;
    }

    res.status(200).json({ 
      message: "Token is valid",
      email: user.email
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      res.status(400).json({ message: "Token and password are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      res.status(400).json({ message: "Invalid or expired token" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    await user.save();

    res.status(200).json({ 
      message: "Password reset successful. You can now login with your new password."
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
};