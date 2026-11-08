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
