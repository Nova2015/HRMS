import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../src/config/database.js";
import User from "../src/models/User.js";

const resetPassword = async () => {
    try {
        const newPassword = process.env.HRMS_NEW_PASSWORD;

        if (!newPassword || newPassword.length < 12) {
            throw new Error("Password must be at least 12 characters");
        }

        await connectDB();

        const email = "keshavb0@gmail.com";
        const user = await User.findOne({ email });

        if (!user) {
            throw new Error("Admin account not found");
        }

        user.passwordHash = await bcrypt.hash(newPassword, 12);
        await user.save();

        console.log("Admin password reset successful.");
        console.log("Email:", email);
        console.log("Password was not displayed.");

    } catch (error) {
        console.error("Password Reset Failed:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

resetPassword();
