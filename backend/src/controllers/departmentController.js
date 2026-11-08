import mongoose from "mongoose";
import Department from "../models/Department.js";
import Employee from "../models/Employee.js";
import Designation from "../models/Designation.js";

// CREATE
export const createDepartment = async (req, res) => {
    try {
        const { name, code, description } = req.body;

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                message: "Department name and code are required"
            });
        }

        const department = await Department.create({
            name,
            code,
            description
        });

        res.status(201).json({
            success: true,
            message: "Department created successfully",
            data: department
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.code === 11000
                ? "Department name or code already exists"
                : error.message
        });
    }
};

// READ ALL
export const getDepartments = async (req, res) => {
    try {
        const departments = await Department.find().sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: departments.length,
            data: departments
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// UPDATE
export const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid department ID"
            });
        }

        const allowedFields = ["name", "code", "description", "isActive"];
        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid department fields provided"
            });
        }

        if (updates.name !== undefined) {
            updates.name = String(updates.name).trim();
            if (!updates.name) {
                return res.status(400).json({ success: false, message: "Department name is required" });
            }
        }

        if (updates.code !== undefined) {
            updates.code = String(updates.code).trim().toUpperCase();
            if (!updates.code) {
                return res.status(400).json({ success: false, message: "Department code is required" });
            }
        }

        if (updates.description !== undefined) {
            updates.description = String(updates.description).trim();
        }

        const department = await Department.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Department updated successfully",
            data: department
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.code === 11000
                ? "Department name or code already exists"
                : error.message
        });
    }
};

// DELETE
export const deleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid department ID"
            });
        }

        const [employeeCount, designationCount] = await Promise.all([
            Employee.countDocuments({ department: id }),
            Designation.countDocuments({ department: id })
        ]);

        if (employeeCount > 0 || designationCount > 0) {
            return res.status(409).json({
                success: false,
                message: "Department is in use. Deactivate it instead of deleting it."
            });
        }

        const department = await Department.findByIdAndDelete(id);

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Department deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
