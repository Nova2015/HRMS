import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

import connectDB from "../src/config/database.js";
import User from "../src/models/User.js";

const resetPassword = async () => {
    try {
        await connectDB();

        const email = "amit.patil@example.com";

        const user = await User.findOne({ email });

        if (!user) {
            throw new Error("User account not found");
        }

        const newPassword = randomBytes(24).toString("base64url");

        user.passwordHash = await bcrypt.hash(newPassword, 12);

        await user.save();

        console.log("\nPASSWORD RESET SUCCESSFUL");
        console.log("Email:", email);
        console.log("New Temporary Password:", newPassword);
        console.log("Save it securely. Do not share it.");

    } catch (error) {
        console.error("Password Reset Failed:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

resetPassword();