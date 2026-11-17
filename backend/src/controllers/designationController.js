import mongoose from "mongoose";
import Designation from "../models/Designation.js";
import Department from "../models/Department.js";
import Employee from "../models/Employee.js";
import { lockDepartmentReference, lockDesignationReference } from "../services/employeeReferenceGuards.js";
import { isTransactionUnavailable } from "../utils/isTransactionUnavailable.js";

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

        const session = await mongoose.startSession();
        let designation;
        try {
            await session.withTransaction(async () => {
                await lockDepartmentReference(department, session);
                designation = new Designation({ name, department, description });
                await designation.save({ session });
            });
        } finally {
            await session.endSession();
        }

        res.status(201).json({
            success: true,
            message: "Designation created successfully",
            data: designation
        });

    } catch (error) {
        res.status(error.code === 11000 ? 409 : isTransactionUnavailable(error) ? 503 : 400).json({
            success: false,
            message: error.code === 11000
                ? "This designation already exists in this department"
                : isTransactionUnavailable(error)
                    ? "Designation creation is temporarily unavailable; please retry"
                    : "Unable to create designation"
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
            message: "Unable to load designations"
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

        let designation;
        if (updates.department !== undefined) {
            const currentDesignation = await Designation.findById(id).select("department");
            const departmentIsChanging = currentDesignation &&
                currentDesignation.department.toString() !== updates.department.toString();
            const assignedEmployeeCount = departmentIsChanging
                ? await Employee.countDocuments({ designation: id })
                : 0;
            if (assignedEmployeeCount > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Designation is assigned to employee records. It cannot be moved to another department."
                });
            }
        }

        let deactivateSession = null;
        if (updates.isActive === false) {
            deactivateSession = await mongoose.startSession();
            try {
                await deactivateSession.withTransaction(async () => {
                    await lockDesignationReference(id, deactivateSession);
                    if (updates.department !== undefined) await lockDepartmentReference(updates.department, deactivateSession);
                    const activeEmployeeCount = await Employee.countDocuments({
                        designation: id,
                        employmentStatus: "active",
                        isArchived: { $ne: true }
                    }).session(deactivateSession);
                    if (activeEmployeeCount > 0) {
                        const inUse = new Error("Designation is assigned to active employees");
                        inUse.code = "DESIGNATION_IN_USE";
                        throw inUse;
                    }
                    designation = await Designation.findByIdAndUpdate(
                        id, { $set: updates }, { new: true, runValidators: true, session: deactivateSession }
                    ).populate("department", "name code");
                });
            } catch (error) {
                await deactivateSession.endSession();
                throw error;
            }
        }

        if (deactivateSession) {
            await deactivateSession.endSession();
        } else if (updates.department !== undefined || updates.isActive === true) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const currentDesignation = await Designation.findById(id).session(session);
                    if (!currentDesignation) return;
                    const targetDepartment = updates.department || currentDesignation.department;
                    await lockDepartmentReference(targetDepartment, session);
                    if (updates.department !== undefined &&
                        currentDesignation.department.toString() !== updates.department.toString()) {
                        const assignedCount = await Employee.countDocuments({ designation: id }).session(session);
                        if (assignedCount > 0) {
                            const inUse = new Error("Designation is assigned to employee records");
                            inUse.code = "DESIGNATION_IN_USE";
                            throw inUse;
                        }
                    }
                    designation = await Designation.findByIdAndUpdate(
                        id, { $set: updates }, { new: true, runValidators: true, session }
                    ).populate("department", "name code");
                });
            } finally {
                await session.endSession();
            }
        } else {
            designation = await Designation.findByIdAndUpdate(
                id, { $set: updates }, { new: true, runValidators: true }
            ).populate("department", "name code");
        }

        if (!designation) {
            return res.status(404).json({ success: false, message: "Designation not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Designation updated successfully",
            data: designation
        });
    } catch (error) {
        return res.status(error.code === 11000 || error.code === "DESIGNATION_IN_USE" ? 409 : isTransactionUnavailable(error) ? 503 : 400).json({
            success: false,
            message: error.code === 11000
                ? "This designation already exists in this department"
                : error.code === "DESIGNATION_IN_USE"
                    ? "Designation is assigned to active employees. Reassign those employees first."
                    : isTransactionUnavailable(error)
                        ? "Designation update is temporarily unavailable; please retry"
                        : "Unable to update designation"
        });
    }
};
