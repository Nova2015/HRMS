
import "dotenv/config";

import crypto from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import connectDB from "../src/config/database.js";
import Employee from "../src/models/Employee.js";
import User from "../src/models/User.js";
import Department from "../src/models/Department.js";
import Designation from "../src/models/Designation.js";

const createAdminAccount = async () => {
    let createdEmployee = null;

    try {
        await connectDB();

        const employeeCode = "PTVG003";
        const email = "keshavb0@gmail.com";

        // Check duplicate records
        const existingEmployee = await Employee.findOne({
            $or: [
                { employeeCode },
                { email }
            ]
        });

        const existingUser = await User.findOne({ email });

        if (existingEmployee || existingUser) {
            throw new Error("Employee or User account already exists.");
        }

        // Find Administration Department
        const department = await Department.findOne({
            code: "ADMIN",
            isActive: true
        });

        if (!department) {
            throw new Error("Administration Department not found.");
        }

        // Find System Administrator Designation
        const designation = await Designation.findOne({
            name: "System Administrator",
            department: department._id,
            isActive: true
        });

        if (!designation) {
            throw new Error("System Administrator Designation not found.");
        }

        // Generate a strong random password
        const temporaryPassword = crypto
            .randomBytes(24)
            .toString("base64url");

        const passwordHash = await bcrypt.hash(
            temporaryPassword,
            12
        );

        // Create Employee
        createdEmployee = await Employee.create({
            employeeCode,
            firstName: "Keshav",
            lastName: "Bansode",
            email,
            phone: "",
            department: department._id,
            designation: designation._id,
            joiningDate: new Date("2026-11-02"),
            employmentStatus: "active"
        });

        // Create Admin User
        const user = await User.create({
            employee: createdEmployee._id,
            email,
            passwordHash,
            role: "admin",
            isActive: true
        });

        console.log("\n================================");
        console.log("ADMIN ACCOUNT CREATED");
        console.log("================================");
        console.log("Employee Code:", employeeCode);
        console.log("Employee ID:", createdEmployee._id);
        console.log("User ID:", user._id);
        console.log("Email:", email);
        console.log("Role:", user.role);
        console.log("Joining Date: 02-11-2026");
        console.log("Temporary Password:", temporaryPassword);
        console.log("================================");
        console.log("SAVE THIS PASSWORD PRIVATELY.");
        console.log("Do not share it in chat.");
        console.log("================================\n");

    } catch (error) {
        // Roll back Employee if User creation fails
        if (createdEmployee) {
            await Employee.findByIdAndDelete(createdEmployee._id);
        }

        console.error("Admin Account Creation Failed:", error.message);
        process.exitCode = 1;

    } finally {
        await mongoose.disconnect();
    }
};

createAdminAccount();
