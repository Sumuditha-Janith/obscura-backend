import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes";
import mediaRouter from "./routes/media.routes";
import passwordRouter from "./routes/password.routes";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const SERVER_PORT = process.env.SERVER_PORT || 5000;
const MONGO_URI = process.env.MONGO_URI as string;

const app = express();

app.use(express.json());
app.use(
    cors({
        origin: ["http://localhost:5173", "https://cinetime-tracker.vercel.app/"],
        methods: ["GET", "POST", "PUT", "DELETE"]
    })
);

// Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/media", mediaRouter);
app.use("/api/v1/password", passwordRouter);

app.get("/", (_req, res) => {
    res.send("CINETIME Backend is Running 🎬");
});

mongoose
    .connect(MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected");
    })
    .catch((err) => {
        console.error(`❌ DB Connection Failed: ${err}`);
        process.exit(1);
    });

app.listen(SERVER_PORT, () => {
    console.log(`🚀 Server running on http://localhost:${SERVER_PORT}`);
});