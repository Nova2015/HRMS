import mongoose from "mongoose";
import Shift from "../models/Shift.js";

const validTime = (value) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const validate = (body, creating = false) => {
    const updates = {};
    for (const field of ["name", "code", "startTime", "endTime", "gracePeriodMinutes", "description", "isActive"]) {
        if (body[field] !== undefined) updates[field] = body[field];
    }

    if (creating && (!updates.name || !updates.code || !updates.startTime || !updates.endTime)) {
        return { error: "Shift name, code, start time and end time are required" };
    }
    if (updates.name !== undefined) {
        updates.name = String(updates.name).trim();
        if (!updates.name || updates.name.length > 80) return { error: "Shift name must contain 1 to 80 characters" };
    }
    if (updates.code !== undefined) {
        updates.code = String(updates.code).trim().toUpperCase();
        if (!updates.code || updates.code.length > 20) return { error: "Shift code must contain 1 to 20 characters" };
    }
    for (const field of ["startTime", "endTime"]) {
        if (updates[field] !== undefined && !validTime(updates[field])) {
            return { error: field + " must use 24-hour HH:MM format" };
        }
    }
    if (updates.gracePeriodMinutes !== undefined &&
        (!Number.isInteger(updates.gracePeriodMinutes) || updates.gracePeriodMinutes < 0 || updates.gracePeriodMinutes > 180)) {
        return { error: "Grace period must be an integer from 0 to 180 minutes" };
    }
    if (updates.description !== undefined) {
        updates.description = String(updates.description).trim();
        if (updates.description.length > 500) return { error: "Description cannot exceed 500 characters" };
    }
    if (updates.isActive !== undefined && typeof updates.isActive !== "boolean") {
        return { error: "isActive must be a boolean" };
    }
    return { updates };
};

export const getShifts = async (req, res) => {
    try {
        const filter = {};
        if (req.user.role !== "admin" && req.user.role !== "hr") filter.isActive = true;
        else if (req.query.includeInactive !== "true") filter.isActive = true;

        const data = await Shift.find(filter).sort({ startTime: 1, name: 1 });
        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("Get shifts error:", error);
        return res.status(500).json({ success: false, message: "Unable to load shifts" });
    }
};

export const createShift = async (req, res) => {
    try {
        const { error, updates } = validate(req.body, true);
        if (error) return res.status(400).json({ success: false, message: error });
        const data = await Shift.create(updates);
        return res.status(201).json({ success: true, message: "Shift created successfully", data });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.code === 11000 ? "Shift code already exists" : error.message
        });
    }
};

export const updateShift = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid shift ID" });
        }
        const { error, updates } = validate(req.body);
        if (error) return res.status(400).json({ success: false, message: error });
        if (!Object.keys(updates).length) {
            return res.status(400).json({ success: false, message: "No valid fields provided" });
        }
        const data = await Shift.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
        if (!data) return res.status(404).json({ success: false, message: "Shift not found" });
        return res.status(200).json({ success: true, message: "Shift updated successfully", data });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.code === 11000 ? "Shift code already exists" : error.message
        });
    }
};

export const deleteShift = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid shift ID" });
        }
        const Employee = mongoose.model("Employee");
        const assignedCount = await Employee.countDocuments({ shift: req.params.id });
        if (assignedCount) {
            return res.status(409).json({ success: false, message: "Shift is assigned to employees. Deactivate it instead." });
        }
        const data = await Shift.findByIdAndDelete(req.params.id);
        if (!data) return res.status(404).json({ success: false, message: "Shift not found" });
        return res.status(200).json({ success: true, message: "Shift deleted successfully" });
    } catch (error) {
        console.error("Delete shift error:", error);
        return res.status(500).json({ success: false, message: "Unable to delete shift" });
    }
};
