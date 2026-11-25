import mongoose from "mongoose";
import Department from "../models/Department.js";
import Team from "../models/Team.js";

const validDepartment = async (departmentId) => {
    if (!mongoose.isValidObjectId(departmentId)) return null;
    return Department.findOne({ _id: departmentId, isActive: true });
};

export const createTeam = async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const code = String(req.body.code || "").trim().toUpperCase();
        const department = String(req.body.department || "");
        const description = String(req.body.description || "").trim();

        if (!name || !code || !department) {
            return res.status(400).json({ success: false, message: "Team name, code and department are required" });
        }
        if (name.length > 100 || code.length > 20 || description.length > 500) {
            return res.status(400).json({ success: false, message: "Team name, code or description exceeds the allowed length" });
        }
        if (!(await validDepartment(department))) {
            return res.status(400).json({ success: false, message: "Select an active department" });
        }

        const team = await Team.create({ name, code, department, description });
        await team.populate("department", "name code");
        return res.status(201).json({ success: true, message: "Team created successfully", data: team });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.code === 11000 ? "Team name or code already exists in this department" : "Unable to create team"
        });
    }
};

export const getTeams = async (req, res) => {
    try {
        const filter = {};
        if (req.query.department) {
            if (!mongoose.isValidObjectId(req.query.department)) {
                return res.status(400).json({ success: false, message: "Invalid department ID" });
            }
            filter.department = req.query.department;
        }
        if (req.query.activeOnly === "true") filter.isActive = true;
        const teams = await Team.find(filter).populate("department", "name code").sort({ name: 1 });
        return res.status(200).json({ success: true, count: teams.length, data: teams });
    } catch {
        return res.status(500).json({ success: false, message: "Unable to load teams" });
    }
};

export const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid team ID" });
        }

        const allowedFields = ["name", "code", "department", "description", "isActive"];
        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }
        if (!Object.keys(updates).length) {
            return res.status(400).json({ success: false, message: "No valid team fields provided" });
        }
        if (updates.name !== undefined) {
            updates.name = String(updates.name).trim();
            if (!updates.name || updates.name.length > 100) return res.status(400).json({ success: false, message: "Valid team name is required (maximum 100 characters)" });
        }
        if (updates.code !== undefined) {
            updates.code = String(updates.code).trim().toUpperCase();
            if (!updates.code || updates.code.length > 20) return res.status(400).json({ success: false, message: "Valid team code is required (maximum 20 characters)" });
        }
        if (updates.description !== undefined) {
            updates.description = String(updates.description).trim();
            if (updates.description.length > 500) return res.status(400).json({ success: false, message: "Description cannot exceed 500 characters" });
        }
        if (updates.department !== undefined && !(await validDepartment(updates.department))) {
            return res.status(400).json({ success: false, message: "Select an active department" });
        }
        const team = await Team.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
            .populate("department", "name code");
        if (!team) return res.status(404).json({ success: false, message: "Team not found" });
        return res.status(200).json({ success: true, message: "Team updated successfully", data: team });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.code === 11000 ? "Team name or code already exists in this department" : "Unable to update team"
        });
    }
};

export const deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid team ID" });
        const team = await Team.findByIdAndDelete(id);
        if (!team) return res.status(404).json({ success: false, message: "Team not found" });
        return res.status(200).json({ success: true, message: "Team deleted successfully" });
    } catch {
        return res.status(500).json({ success: false, message: "Unable to delete team" });
    }
};
