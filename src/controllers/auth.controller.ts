import { Request, Response } from "express";
import { Role, Status, User } from "../models/User"; // Removed unused IUser import
import bcrypt from "bcryptjs";
import { signAccessToken, signRefreshToken } from "../utils/tokens";
import { AuthRequest } from "../middleware/auth";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { sendOTPEmail } from "../utils/mailer";
dotenv.config();

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { firstname, lastname, email, password } = req.body;

        if (!firstname || !lastname || !email || !password) {
            res.status(400).json({ message: "All fields are required" });
            return;
        }

        // ========== TEMPORARY: Only USER registration allowed ==========
        // Comment out role field and validation for now
        // const { role } = req.body;
        // if (role && role !== Role.USER && role !== Role.AUTHOR) {
        //   res.status(400).json({ message: "Invalid role" });
        //   return;
        // }
        // ===============================================================

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            res.status(400).json({ message: "Email already registered" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // ========== TEMPORARY: Force USER role ==========
        const userRole = Role.USER; // Hardcoded
        const approvalStatus = Status.APPROVED; // Auto-approve all users

        // Original logic (commented out for now):
        // const userRole = role || Role.USER; // Use provided role or default to USER
        // const approvalStatus = userRole === Role.AUTHOR ? Status.PENDING : Status.APPROVED;
        // =================================================

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        const newUser = new User({
            firstname,
            lastname,
            email,
            password: hashedPassword,
            roles: [userRole],
            approved: approvalStatus,
            otp,
            otpExpires,
            isEmailVerified: false
        });

        await newUser.save();
        await sendOTPEmail(email, otp);

        res.status(201).json({
            message: "Registration successful. Please verify your email with OTP.",
            data: {
                id: newUser._id,
                email: newUser.email,
                roles: newUser.roles,
                // Remove role-specific message temporarily
                // approved: newUser.approved
            }
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const verifyOTP = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        if (user.otp !== otp) {
            res.status(400).json({ message: "Invalid OTP" });
            return;
        }

        if (user.otpExpires && new Date() > user.otpExpires) {
            res.status(400).json({ message: "OTP expired" });
            return;
        }

        user.isEmailVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.status(200).json({
            message: "Email verified successfully. You can now login."
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            res.status(401).json({ message: "Invalid credentials" });
            return;
        }

        if (!user.isEmailVerified) {
            res.status(403).json({ message: "Please verify your email first" });
            return;
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            res.status(401).json({ message: "Invalid credentials" });
            return;
        }

        if (user.approved !== Status.APPROVED) {
            res.status(403).json({ message: "Account pending approval" });
            return;
        }

        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);

        res.status(200).json({
            message: "Login successful",
            data: {
                email: user.email,
                roles: user.roles,
                accessToken,
                refreshToken
            }
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const getMyDetails = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const userId = req.user.sub;
        const user = await User.findById(userId).select("-password -otp");

        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const { firstname, lastname, email, roles, approved, isEmailVerified } = user;
        res.status(200).json({
            message: "OK",
            data: { firstname, lastname, email, roles, approved, isEmailVerified }
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const handleRefreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ message: "Token required" });
            return;
        }

        const payload: any = jwt.verify(token, JWT_REFRESH_SECRET);
        const user = await User.findById(payload.sub);
        if (!user) {
            res.status(403).json({ message: "Invalid refresh token" });
            return;
        }

        const accessToken = signAccessToken(user);
        res.status(200).json({ accessToken });
    } catch (err: any) {
        res.status(403).json({ message: "Invalid or expired token" });
    }
};

export const registerAdmin = async (_req: Request, _res: Response): Promise<void> => {
    // not implemented yet. will implement later.
};