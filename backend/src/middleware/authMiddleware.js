import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Employee from "../models/Employee.js";

export const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const token = authHeader.slice(7).trim();
        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
            console.error("JWT_SECRET is missing or does not meet the minimum length.");
            return res.status(503).json({
                success: false,
                message: "Authentication service is not configured"
            });
        }

        const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });

        if (!decoded?.userId || !mongoose.isValidObjectId(decoded.userId)) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired authentication token"
            });
        }

        const user = await User.findById(decoded.userId).select("_id employee role isActive");

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: "Invalid or disabled user account"
            });
        }

        if (!user.employee || !mongoose.isValidObjectId(user.employee)) {
            return res.status(403).json({
                success: false,
                message: "User account is not linked to a valid employee"
            });
        }

        const employee = await Employee.findById(user.employee).select("_id employmentStatus");
        if (!employee || employee.employmentStatus !== "active") {
            return res.status(403).json({
                success: false,
                message: "Employee account is not active"
            });
        }

        req.user = {
            userId: user._id.toString(),
            role: user.role,
            employeeId: employee._id.toString()
        };

        return next();
    } catch (error) {
        if (error.name !== "JsonWebTokenError" && error.name !== "TokenExpiredError" &&
            error.name !== "CastError") {
            console.error("Authentication middleware error:", error.message);
        }

        return res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token"
        });
    }
};
