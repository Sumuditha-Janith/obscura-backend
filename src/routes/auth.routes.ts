import { Router } from "express";
import {
    getMyDetails,
    handleRefreshToken,
    login,
    register,
    verifyOTP
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/refresh", handleRefreshToken);
router.get("/me", authenticate, getMyDetails);

export default router;