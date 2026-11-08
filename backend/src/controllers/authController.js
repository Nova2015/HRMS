
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import Employee from "../models/Employee.js";

// LOGIN
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: "JWT configuration error"
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase().trim()
        }).select("+passwordHash");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account is disabled"
            });
        }

        const employee = await Employee.findById(user.employee);

        if (!employee || employee.employmentStatus !== "active") {
            return res.status(403).json({
                success: false,
                message: "Employee account is not active"
            });
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            {
                userId: user._id.toString(),
                role: user.role,
                employeeId: employee._id.toString()
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || "1d"
            }
        );

        user.lastLogin = new Date();
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            data: {
                userId: user._id,
                employeeId: employee._id,
                employeeCode: employee.employeeCode,
                name: `${employee.firstName} ${employee.lastName}`,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
};

// GET LOGGED-IN USER
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .populate({
                path: "employee",
                select: "employeeCode firstName lastName email phone department designation shift employmentStatus",
                populate: [
                    { path: "department", select: "name code" },
                    { path: "designation", select: "name" },
                    { path: "shift", select: "name weeklyOffDays startTime endTime" }
                ]
            });

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: "User account not found or disabled"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                userId: user._id,
                email: user.email,
                role: user.role,
                employee: user.employee
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// CHANGE PASSWORD
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required"
            });
        }

        if (newPassword.length < 12) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 12 characters long"
            });
        }

        const user = await User.findById(req.user.userId)
            .select("+passwordHash");

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: "User account not found or disabled"
            });
        }

        const isPasswordValid = await bcrypt.compare(
            currentPassword,
            user.passwordHash
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect"
            });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 12);
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password changed successfully. Please login again."
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
