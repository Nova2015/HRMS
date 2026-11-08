import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

import connectDB from "../src/config/database.js";
import Employee from "../src/models/Employee.js";
import User from "../src/models/User.js";

const createEmployeeUser = async () => {
    try {
        await connectDB();

        const employeeId = "6af077bfee75972d6ffc7045";

        const employee = await Employee.findById(employeeId);

        if (!employee) {
            throw new Error("Employee not found");
        }

        if (employee.employmentStatus !== "active") {
            throw new Error("Employee is not active");
        }

        const existingUser = await User.findOne({
            $or: [
                { employee: employee._id },
                { email: employee.email }
            ]
        });

        if (existingUser) {
            throw new Error("User account already exists");
        }

        const temporaryPassword = randomBytes(18).toString("base64url");

        const passwordHash = await bcrypt.hash(
            temporaryPassword,
            12
        );

        await User.create({
            employee: employee._id,
            email: employee.email,
            passwordHash,
            role: "employee",
            isActive: true
        });

        console.log("\nUSER ACCOUNT CREATED SUCCESSFULLY");
        console.log("--------------------------------");
        console.log("Email:", employee.email);
        console.log("Role: employee");
        console.log("Temporary Password:", temporaryPassword);
        console.log("--------------------------------");
        console.log("Save this password securely.");

    } catch (error) {
        console.error("Account Creation Failed:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

createEmployeeUser();