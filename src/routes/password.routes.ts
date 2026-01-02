import { Router } from "express";
import { 
  requestPasswordReset, 
  verifyResetToken, 
  resetPassword 
} from "../controllers/password.controller";

const router = Router();

router.post("/request", requestPasswordReset);
router.get("/verify/:token", verifyResetToken);
router.post("/reset/:token", resetPassword);

export default router;