import mongoose from "mongoose";
import Department from "../models/Department.js";
import Team from "../models/Team.js";
import Employee from "../models/Employee.js";
import { lockDepartmentReference } from "../services/employeeReferenceGuards.js";
import { isTransactionUnavailable } from "../utils/isTransactionUnavailable.js";

const validDepartment = async (departmentId) => {
    if (!mongoose.isValidObjectId(departmentId)) return null;
    return Department.findOne({ _id: departmentId, isActive: true });
};

const lockTeamForMutation = async (id, session) => {
    const team = await Team.findOneAndUpdate(
        { _id: id },
        { $inc: { assignmentVersion: 1 } },
        { new: true, session }
    );
    if (!team) return null;
    const assignedEmployees = await Employee.countDocuments({ team: id }).session(session);
    if (assignedEmployees > 0) {
        const inUse = new Error("Reassign employees before changing or deleting this team");
        inUse.code = "TEAM_IN_USE";
        throw inUse;
    }
    return team;
};

const conflictStatus = (error) => error.code === 11000 || error.code === "TEAM_IN_USE" ? 409
    : isTransactionUnavailable(error) ? 503 : 400;

const errorMessage = (error, fallback) => error.code === 11000
    ? "Team name or code already exists in this department"
    : error.code === "TEAM_IN_USE"
        ? "Reassign employees before deactivating, moving or deleting this team"
        : isTransactionUnavailable(error)
            ? "Team change is temporarily unavailable; please retry"
            : fallback;

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
        if (!mongoose.isValidObjectId(department)) {
            return res.status(400).json({ success: false, message: "Select an active department" });
        }

        const session = await mongoose.startSession();
        let team;
        try {
            await session.withTransaction(async () => {
                await lockDepartmentReference(department, session);
                [team] = await Team.create([{ name, code, department, description }], { session });
            });
        } finally {
            await session.endSession();
        }
        await team.populate("department", "name code");
        return res.status(201).json({ success: true, message: "Team created successfully", data: team });
    } catch (error) {
        return res.status(conflictStatus(error)).json({
            success: false,
            message: error.code === "REFERENCE_INACTIVE"
                ? "Select an active department"
                : errorMessage(error, "Unable to create team")
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

        const mustProtectAssignments = updates.isActive === false || updates.department !== undefined;
        let team;
        if (mustProtectAssignments) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const current = await lockTeamForMutation(id, session);
                    if (!current) return;
                    team = await Team.findByIdAndUpdate(id, { $set: updates }, {
                        new: true, runValidators: true, session
                    }).populate("department", "name code");
                });
            } finally {
                await session.endSession();
            }
        } else {
            team = await Team.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
                .populate("department", "name code");
        }
        if (!team) return res.status(404).json({ success: false, message: "Team not found" });
        return res.status(200).json({ success: true, message: "Team updated successfully", data: team });
    } catch (error) {
        return res.status(conflictStatus(error)).json({
            success: false,
            message: errorMessage(error, "Unable to update team")
        });
    }
};

export const deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid team ID" });
        const session = await mongoose.startSession();
        let deleted = false;
        try {
            await session.withTransaction(async () => {
                const team = await lockTeamForMutation(id, session);
                if (!team) return;
                await Team.deleteOne({ _id: id }, { session });
                deleted = true;
            });
        } finally {
            await session.endSession();
        }
        if (!deleted) return res.status(404).json({ success: false, message: "Team not found" });
        return res.status(200).json({ success: true, message: "Team deleted successfully" });
    } catch (error) {
        return res.status(conflictStatus(error)).json({
            success: false,
            message: errorMessage(error, "Unable to delete team")
        });
    }
};
