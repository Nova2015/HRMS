import mongoose from "mongoose";
import Holiday from "../models/Holiday.js";

const isValidDateKey = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
};

const validateHolidayFields = (body, creating = false) => {
    const updates = {};
    const allowed = ["name", "dateKey", "type", "description", "isActive"];

    for (const field of allowed) {
        if (body[field] !== undefined) updates[field] = body[field];
    }

    if (creating && (!updates.name || !updates.dateKey)) {
        return { error: "Holiday name and date are required" };
    }

    if (updates.name !== undefined) {
        updates.name = String(updates.name).trim();
        if (!updates.name || updates.name.length > 120) {
            return { error: "Holiday name must contain 1 to 120 characters" };
        }
    }

    if (updates.dateKey !== undefined && !isValidDateKey(updates.dateKey)) {
        return { error: "Date must be a valid YYYY-MM-DD date" };
    }

    if (updates.type !== undefined &&
        !["public", "optional", "company"].includes(updates.type)) {
        return { error: "Invalid holiday type" };
    }

    if (updates.description !== undefined) {
        updates.description = String(updates.description).trim();
        if (updates.description.length > 500) {
            return { error: "Description cannot exceed 500 characters" };
        }
    }

    if (updates.isActive !== undefined && typeof updates.isActive !== "boolean") {
        return { error: "isActive must be a boolean" };
    }

    return { updates };
};

// Authenticated users can view active holidays. Admin/HR can include inactive.
export const getHolidays = async (req, res) => {
    try {
        const filter = {};
        if (req.user.role !== "admin" && req.user.role !== "hr") {
            filter.isActive = true;
        } else if (req.query.includeInactive !== "true") {
            filter.isActive = true;
        }

        const { year, from, to } = req.query;
        if (year !== undefined) {
            if (!/^\d{4}$/.test(String(year))) {
                return res.status(400).json({ success: false, message: "Invalid year" });
            }
            filter.dateKey = { $gte: `${year}-01-01`, $lte: `${year}-12-31` };
        } else if (from || to) {
            if ((from && !isValidDateKey(from)) || (to && !isValidDateKey(to))) {
                return res.status(400).json({ success: false, message: "Invalid date range" });
            }
            filter.dateKey = {};
            if (from) filter.dateKey.$gte = from;
            if (to) filter.dateKey.$lte = to;
        }

        const data = await Holiday.find(filter)
            .populate("createdBy", "email role")
            .sort({ dateKey: 1, name: 1 })
            .limit(1000);

        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("Get holidays error:", error);
        return res.status(500).json({ success: false, message: "Unable to load holidays" });
    }
};

export const createHoliday = async (req, res) => {
    try {
        const { error, updates } = validateHolidayFields(req.body, true);
        if (error) return res.status(400).json({ success: false, message: error });

        const holiday = await Holiday.create({
            ...updates,
            createdBy: req.user.userId
        });

        return res.status(201).json({
            success: true,
            message: "Holiday created successfully",
            data: holiday
        });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 500).json({
            success: false,
            message: error.code === 11000
                ? "A holiday with this name and date already exists"
                : "Unable to create holiday"
        });
    }
};

export const updateHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid holiday ID" });
        }

        const { error, updates } = validateHolidayFields(req.body);
        if (error) return res.status(400).json({ success: false, message: error });
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: "No valid fields provided" });
        }

        const holiday = await Holiday.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!holiday) {
            return res.status(404).json({ success: false, message: "Holiday not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Holiday updated successfully",
            data: holiday
        });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.code === 11000
                ? "A holiday with this name and date already exists"
                : "Unable to update holiday"
        });
    }
};

export const deleteHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid holiday ID" });
        }

        const holiday = await Holiday.findByIdAndDelete(id);
        if (!holiday) {
            return res.status(404).json({ success: false, message: "Holiday not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Holiday deleted successfully"
        });
    } catch (error) {
        console.error("Delete holiday error:", error);
        return res.status(500).json({ success: false, message: "Unable to delete holiday" });
    }
};
