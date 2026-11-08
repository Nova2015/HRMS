import mongoose from "mongoose";
import Employee from "../models/Employee.js";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";

// CREATE EMPLOYEE
export const createEmployee = async (req, res) => {
    try {
        const {
            employeeCode,
            firstName,
            lastName,
            email,
            phone,
            department,
            designation,
            joiningDate,
            role
        } = req.body;

        if (
            !employeeCode || !firstName || !lastName ||
            !email || !department || !designation || !joiningDate
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required employee details"
            });
        }

        if (
            !mongoose.isValidObjectId(department) ||
            !mongoose.isValidObjectId(designation)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid department or designation ID"
            });
        }

        const departmentExists = await Department.findById(department);
        const designationExists = await Designation.findById(designation);

        if (!departmentExists || !designationExists) {
            return res.status(404).json({
                success: false,
                message: "Department or designation not found"
            });
        }

        if (designationExists.department.toString() !== department) {
            return res.status(400).json({
                success: false,
                message: "Designation does not belong to selected department"
            });
        }

        const employee = await Employee.create({
            employeeCode,
            firstName,
            lastName,
            email,
            phone,
            department,
            designation,
            joiningDate,
            role
        });

        res.status(201).json({
            success: true,
            message: "Employee created successfully",
            data: employee
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.code === 11000
                ? "Employee code or email already exists"
                : error.message
        });
    }
};

// GET ALL EMPLOYEES
export const getEmployees = async (req, res) => {
    try {
        const employees = await Employee.find()
            .populate("department", "name code")
            .populate("designation", "name")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: employees.length,
            data: employees
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// GET EMPLOYEE BY ID
export const getEmployeeById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee ID"
            });
        }

        const employee = await Employee.findById(id)
            .populate("department", "name code")
            .populate("designation", "name");

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        res.status(200).json({
            success: true,
            data: employee
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// UPDATE EMPLOYEE
export const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee ID"
            });
        }

        const employee = await Employee.findById(id);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        const allowedFields = [
            "firstName",
            "lastName",
            "email",
            "phone",
            "department",
            "designation",
            "joiningDate",
            "employmentStatus"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update"
            });
        }

        const departmentId = updates.department || employee.department.toString();
        const designationId = updates.designation || employee.designation.toString();

        if (
            !mongoose.isValidObjectId(departmentId) ||
            !mongoose.isValidObjectId(designationId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid department or designation ID"
            });
        }

        const departmentExists = await Department.findById(departmentId);
        const designationExists = await Designation.findById(designationId);

        if (!departmentExists || !designationExists) {
            return res.status(404).json({
                success: false,
                message: "Department or designation not found"
            });
        }

        if (designationExists.department.toString() !== departmentId) {
            return res.status(400).json({
                success: false,
                message: "Designation does not belong to selected department"
            });
        }

        if (
            updates.employmentStatus &&
            !["active", "inactive", "resigned", "terminated"].includes(
                updates.employmentStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid employment status"
            });
        }

        const updatedEmployee = await Employee.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        )
            .populate("department", "name code")
            .populate("designation", "name");

        res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: updatedEmployee
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.code === 11000
                ? "Email already exists"
                : error.message
        });
    }
};

// DEACTIVATE EMPLOYEE
export const deactivateEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee ID"
            });
        }

        const employee = await Employee.findByIdAndUpdate(
            id,
            { $set: { employmentStatus: "inactive" } },
            { new: true, runValidators: true }
        );

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Employee deactivated successfully",
            data: employee
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
