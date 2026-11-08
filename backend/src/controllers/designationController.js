import mongoose from "mongoose";
import Designation from "../models/Designation.js";
import Department from "../models/Department.js";

// CREATE DESIGNATION
export const createDesignation = async (req, res) => {
    try {
        const { name, department, description } = req.body;

        if (!name || !department) {
            return res.status(400).json({
                success: false,
                message: "Designation name and department are required"
            });
        }

        if (!mongoose.isValidObjectId(department)) {
            return res.status(400).json({
                success: false,
                message: "Invalid department ID"
            });
        }

        const departmentExists = await Department.findById(department);

        if (!departmentExists) {
            return res.status(404).json({
                success: false,
                message: "Department not found"
            });
        }

        const designation = await Designation.create({
            name,
            department,
            description
        });

        res.status(201).json({
            success: true,
            message: "Designation created successfully",
            data: designation
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.code === 11000
                ? "This designation already exists in this department"
                : error.message
        });
    }
};

// GET ALL DESIGNATIONS
export const getDesignations = async (req, res) => {
    try {
        const designations = await Designation.find()
            .populate("department", "name code")
            .sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: designations.length,
            data: designations
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// UPDATE DESIGNATION
export const updateDesignation = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid designation ID" });
        }

        const allowedFields = ["name", "department", "description", "isActive"];
        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: "No valid fields provided" });
        }

        if (updates.name !== undefined) {
            updates.name = String(updates.name).trim();
            if (!updates.name) {
                return res.status(400).json({ success: false, message: "Designation name is required" });
            }
        }

        const departmentId = updates.department;
        if (departmentId !== undefined) {
            if (!mongoose.isValidObjectId(departmentId)) {
                return res.status(400).json({ success: false, message: "Invalid department ID" });
            }
            const department = await Department.findById(departmentId);
            if (!department || !department.isActive) {
                return res.status(400).json({ success: false, message: "An active department is required" });
            }
        }

        const designation = await Designation.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        ).populate("department", "name code");

        if (!designation) {
            return res.status(404).json({ success: false, message: "Designation not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Designation updated successfully",
            data: designation
        });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.code === 11000
                ? "This designation already exists in this department"
                : error.message
        });
    }
};
