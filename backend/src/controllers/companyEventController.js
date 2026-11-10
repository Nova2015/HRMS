import mongoose from "mongoose";
import CompanyEvent from "../models/CompanyEvent.js";

const validDate = (value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
};

const validateFields = (body, creating = false) => {
    const updates = {};
    for (const field of ["title", "description", "eventType", "startAt", "endAt", "allDay", "location", "status"]) {
        if (body[field] !== undefined) updates[field] = body[field];
    }

    if (creating && (!updates.title || !updates.startAt || !updates.endAt)) {
        return { error: "Title, start date/time and end date/time are required" };
    }
    if (updates.title !== undefined) {
        updates.title = String(updates.title).trim();
        if (!updates.title || updates.title.length > 140) return { error: "Title must contain 1 to 140 characters" };
    }
    if (updates.description !== undefined) {
        updates.description = String(updates.description).trim();
        if (updates.description.length > 2000) return { error: "Description cannot exceed 2000 characters" };
    }
    if (updates.eventType !== undefined && !["meeting", "company_event", "training", "other"].includes(updates.eventType)) {
        return { error: "Invalid event type" };
    }
    for (const field of ["startAt", "endAt"]) {
        if (updates[field] !== undefined) {
            if (!validDate(updates[field])) return { error: field + " must be a valid ISO date/time" };
            updates[field] = new Date(updates[field]);
        }
    }
    if (updates.allDay !== undefined && typeof updates.allDay !== "boolean") {
        return { error: "allDay must be a boolean" };
    }
    if (updates.location !== undefined) {
        updates.location = String(updates.location).trim();
        if (updates.location.length > 200) return { error: "Location cannot exceed 200 characters" };
    }
    if (updates.status !== undefined && !["scheduled", "cancelled"].includes(updates.status)) {
        return { error: "Invalid event status" };
    }
    return { updates };
};

const hasValidDuration = (updates, current = null) => {
    const startAt = updates.startAt || current?.startAt;
    const endAt = updates.endAt || current?.endAt;
    return startAt && endAt && endAt > startAt;
};

// All signed-in roles can view scheduled and cancelled events. Only Admin/HR can manage them.
export const getCompanyEvents = async (req, res) => {
    try {
        const filter = {};
        if (req.query.from !== undefined || req.query.to !== undefined) {
            if (!validDate(req.query.from) || !validDate(req.query.to)) {
                return res.status(400).json({ success: false, message: "Both from and to must be valid date/time values" });
            }
            const from = new Date(req.query.from);
            const to = new Date(req.query.to);
            if (to <= from || to - from > 366 * 24 * 60 * 60 * 1000) {
                return res.status(400).json({ success: false, message: "Date range must be positive and no longer than 366 days" });
            }
            filter.startAt = { $lte: to };
            filter.endAt = { $gte: from };
        }
        if (req.query.status !== "all") filter.status = "scheduled";

        const data = await CompanyEvent.find(filter)
            .populate("createdBy", "email role")
            .sort({ startAt: 1, _id: 1 })
            .limit(500)
            .lean();

        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("Get company events error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load company calendar events" });
    }
};

export const createCompanyEvent = async (req, res) => {
    try {
        const { error, updates } = validateFields(req.body, true);
        if (error) return res.status(400).json({ success: false, message: error });
        if (!hasValidDuration(updates)) {
            return res.status(400).json({ success: false, message: "End date/time must be later than start date/time" });
        }
        const data = await CompanyEvent.create({ ...updates, createdBy: req.user.userId });
        return res.status(201).json({ success: true, message: "Calendar event created successfully", data });
    } catch (error) {
        console.error("Create company event error:", error.message);
        return res.status(400).json({ success: false, message: "Unable to create calendar event" });
    }
};

export const updateCompanyEvent = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid event ID" });
        }
        const { error, updates } = validateFields(req.body);
        if (error) return res.status(400).json({ success: false, message: error });
        if (!Object.keys(updates).length) {
            return res.status(400).json({ success: false, message: "No valid fields provided" });
        }
        const current = await CompanyEvent.findById(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: "Calendar event not found" });
        if (!hasValidDuration(updates, current)) {
            return res.status(400).json({ success: false, message: "End date/time must be later than start date/time" });
        }
        Object.assign(current, updates);
        await current.save();
        return res.status(200).json({ success: true, message: "Calendar event updated successfully", data: current });
    } catch (error) {
        console.error("Update company event error:", error.message);
        return res.status(400).json({ success: false, message: "Unable to update calendar event" });
    }
};

export const deleteCompanyEvent = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid event ID" });
        }
        const data = await CompanyEvent.findByIdAndDelete(req.params.id);
        if (!data) return res.status(404).json({ success: false, message: "Calendar event not found" });
        return res.status(200).json({ success: true, message: "Calendar event deleted successfully" });
    } catch (error) {
        console.error("Delete company event error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to delete calendar event" });
    }
};
