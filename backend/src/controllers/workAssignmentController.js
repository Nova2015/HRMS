import mongoose from "mongoose";
import WorkAssignment from "../models/WorkAssignment.js";
import Employee from "../models/Employee.js";
import Team from "../models/Team.js";
import User from "../models/User.js";

const activeEmployee = (id) => Employee.findOne({
    _id: id, employmentStatus: "active", isArchived: { $ne: true }
}).select("_id department team designation").populate("designation", "name");

const getActor = async (req) => activeEmployee(req.user.employeeId);

const getAccess = async (req) => {
    if (["admin", "hr"].includes(req.user.role)) {
        return { organizationWide: true, canAssign: true, filter: {} };
    }
    const employee = await getActor(req);
    if (!employee) return { employee: null, filter: { _id: null }, canAssign: false };
    const isFounder = String(employee.designation?.name || "").trim().toLowerCase() === "founder";
    if (req.user.role === "manager") {
        return {
            employee,
            organizationWide: isFounder,
            canAssign: true,
            filter: isFounder ? {} : { department: employee.department }
        };
    }
    if (req.user.role === "team_leader") {
        return { employee, organizationWide: false, canAssign: false, filter: { team: employee.team } };
    }
    return {
        employee,
        organizationWide: false,
        canAssign: false,
        filter: { assignedTo: employee._id }
    };
};

const loadAssignee = async (employeeId, { department, team, allowedRoles = ["employee", "team_leader"] }) => {
    if (!mongoose.isValidObjectId(employeeId)) return null;
    const employee = await activeEmployee(employeeId);
    if (!employee || !employee.team || employee.department.toString() !== department.toString() ||
        employee.team.toString() !== team.toString()) return null;
    const user = await User.findOne({ employee: employee._id, isActive: true }).select("_id role");
    if (!user || !allowedRoles.includes(user.role)) return null;
    return { employee, user };
};

const populateAssignment = (query) => query
    .populate("department", "name code")
    .populate("team", "name code")
    .populate("parentAssignment", "title status assignedTo reviewer")
    .populate("rootAssignment", "title")
    .populate("assignedBy", "employeeCode firstName lastName")
    .populate("assignedTo", "employeeCode firstName lastName")
    .populate("reviewer", "employeeCode firstName lastName");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

export const getWorkAssignments = async (req, res) => {
    try {
        const access = await getAccess(req);
        if (req.user.role === "team_leader") {
            access.filter.team = access.employee?.team || null;
        }
        if (req.query.status) access.filter.status = req.query.status;
        if (req.query.mine === "true") access.filter.assignedTo = req.user.employeeId;
        const assignments = await populateAssignment(
            WorkAssignment.find(access.filter).sort({ createdAt: -1 }).limit(300)
        );
        const data = await assignments;
        return res.json({
            success: true,
            data,
            permissions: {
                canAssign: access.canAssign,
                canDelegate: req.user.role === "team_leader",
                organizationWide: access.organizationWide
            }
        });
    } catch (error) {
        console.error("Get work assignments:", error.message);
        return fail(res, 500, "Unable to load work assignments");
    }
};

export const createWorkAssignment = async (req, res) => {
    try {
        const access = await getAccess(req);
        if (!access.canAssign) return fail(res, 403, "Only Admin, HR or Manager can create department work assignments");
        const title = String(req.body.title || "").trim();
        const description = String(req.body.description || "").trim();
        const { department, team, assignedTo, givenDays, priority = "medium" } = req.body;
        if (!title || title.length > 180 || description.length > 10000) return fail(res, 400, "Enter a valid title and description");
        if (!mongoose.isValidObjectId(department) || !mongoose.isValidObjectId(team) ||
            !Number.isInteger(Number(givenDays)) || Number(givenDays) < 1 || Number(givenDays) > 3650) {
            return fail(res, 400, "Select a valid department, team, assignee and given days");
        }
        if (!["low", "medium", "high", "urgent"].includes(priority)) return fail(res, 400, "Invalid priority");
        if (!access.organizationWide && access.employee.department.toString() !== department) {
            return fail(res, 403, "You can assign work only within your department");
        }
        const teamDoc = await Team.findOne({ _id: team, department, isActive: true });
        if (!teamDoc) return fail(res, 400, "Select an active team from the selected department");
        const target = await loadAssignee(assignedTo, { department, team });
        if (!target) return fail(res, 400, "Assignee must be an active Employee or Team Leader in the selected team");
        if (target.user.role === "team_leader" && teamDoc.primaryTeamLeader?.toString() !== target.employee._id.toString()) {
            return fail(res, 400, "Assign Team Leader work only to the Team Master Primary Team Leader");
        }
        const days = Number(givenDays);
        const now = new Date();
        const reviewer = access.employee?._id || req.user.employeeId;
        const assignment = await WorkAssignment.create({
            title, description, department, team,
            assignedBy: req.user.employeeId,
            assignedTo: target.employee._id,
            reviewer,
            priority,
            givenDays: days,
            assignedAt: now,
            dueDate: new Date(now.getTime() + days * 86400000),
            history: [{
                action: "created",
                actorUser: req.user.userId,
                actorEmployee: req.user.employeeId,
                toStatus: "assigned"
            }]
        });
        assignment.rootAssignment = assignment._id;
        await assignment.save();
        return res.status(201).json({
            success: true,
            message: "Work assigned successfully",
            data: await populateAssignment(WorkAssignment.findById(assignment._id))
        });
    } catch (error) {
        console.error("Create work assignment:", error.message);
        return fail(res, 500, "Unable to create work assignment");
    }
};

export const delegateWorkAssignment = async (req, res) => {
    try {
        if (req.user.role !== "team_leader") return fail(res, 403, "Only the assigned Team Leader can delegate this work");
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid work assignment ID");
        const parent = await WorkAssignment.findById(req.params.id);
        if (!parent) return fail(res, 404, "Work assignment not found");
        if (parent.assignedTo.toString() !== req.user.employeeId) return fail(res, 403, "You can delegate only work assigned to you");
        if (parent.status === "completed" || parent.status === "submitted_for_review") return fail(res, 409, "This work cannot be delegated in its current status");
        const actor = await getActor(req);
        if (!actor?.team || actor.team.toString() !== parent.team.toString()) return fail(res, 403, "Team Leader can delegate only within their assigned team");
        const target = await loadAssignee(req.body.assignedTo, {
            department: parent.department,
            team: parent.team,
            allowedRoles: ["employee"]
        });
        if (!target || target.employee._id.toString() === actor._id.toString()) return fail(res, 400, "Select another active employee from your team");
        const givenDays = Number(req.body.givenDays);
        if (!Number.isInteger(givenDays) || givenDays < 1 || givenDays > 3650) return fail(res, 400, "Given days must be between 1 and 3650");
        const title = String(req.body.title || parent.title).trim();
        if (!title || title.length > 180) return fail(res, 400, "Enter a valid task title");
        const now = new Date();
        const child = await WorkAssignment.create({
            title,
            description: String(req.body.description ?? parent.description).trim(),
            department: parent.department,
            team: parent.team,
            parentAssignment: parent._id,
            rootAssignment: parent.rootAssignment || parent._id,
            delegationDepth: parent.delegationDepth + 1,
            assignedBy: actor._id,
            assignedTo: target.employee._id,
            reviewer: actor._id,
            priority: parent.priority,
            givenDays,
            assignedAt: now,
            dueDate: new Date(now.getTime() + givenDays * 86400000),
            history: [{
                action: "delegated",
                actorUser: req.user.userId,
                actorEmployee: actor._id,
                toStatus: "assigned",
                note: String(req.body.note || "").trim().slice(0, 2000)
            }]
        });
        return res.status(201).json({
            success: true,
            message: "Work delegated successfully",
            data: await populateAssignment(WorkAssignment.findById(child._id))
        });
    } catch (error) {
        console.error("Delegate work assignment:", error.message);
        return fail(res, 500, "Unable to delegate work");
    }
};

export const updateMyWorkStatus = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid work assignment ID");
        const status = String(req.body.status || "");
        const allowed = new Set(["accepted", "in_progress", "on_hold", "pending", "submitted_for_review"]);
        if (!allowed.has(status)) return fail(res, 400, "Invalid work status");
        const assignment = await WorkAssignment.findOne({ _id: req.params.id, assignedTo: req.user.employeeId });
        if (!assignment) return fail(res, 404, "Assigned work not found");
        if (["completed", "submitted_for_review"].includes(assignment.status)) return fail(res, 409, "This work is not available for status updates");
        const fromStatus = assignment.status;
        const now = new Date();
        const note = String(req.body.note || "").trim().slice(0, 2000);
        const update = { status, $inc: { version: 1 } };
        if (status === "accepted") update.acceptedAt = now;
        if (status === "in_progress" && !assignment.startedAt) update.startedAt = now;
        if (status === "submitted_for_review") {
            update.submittedAt = now;
            update.completionRemarks = String(req.body.completionRemarks || "").trim().slice(0, 4000);
        }
        const saved = await WorkAssignment.findOneAndUpdate(
            { _id: assignment._id, version: assignment.version, status: fromStatus },
            {
                $set: Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$"))),
                $inc: update.$inc,
                $push: { history: {
                    action: status === "submitted_for_review" ? "submitted" : status === "accepted" ? "accepted" : status === "in_progress" ? "started" : status === "on_hold" ? "paused" : "resumed",
                    actorUser: req.user.userId,
                    actorEmployee: req.user.employeeId,
                    fromStatus,
                    toStatus: status,
                    note
                } }
            },
            { new: true, runValidators: true }
        );
        if (!saved) return fail(res, 409, "Work changed by another user. Refresh and retry");
        return res.json({ success: true, message: "Work status updated", data: await populateAssignment(WorkAssignment.findById(saved._id)) });
    } catch (error) {
        console.error("Update work status:", error.message);
        return fail(res, 500, "Unable to update work status");
    }
};

export const reviewWorkAssignment = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid work assignment ID");
        const decision = String(req.body.decision || "");
        const note = String(req.body.note || "").trim();
        if (!["approve", "rework"].includes(decision)) return fail(res, 400, "Choose approve or rework");
        if (decision === "rework" && !note) return fail(res, 400, "A reason is required when returning work for rework");
        const assignment = await WorkAssignment.findOne({ _id: req.params.id, reviewer: req.user.employeeId });
        if (!assignment) return fail(res, 404, "Work awaiting your review was not found");
        if (assignment.status !== "submitted_for_review") return fail(res, 409, "Only submitted work can be reviewed");
        const status = decision === "approve" ? "completed" : "rework_required";
        const now = new Date();
        const saved = await WorkAssignment.findOneAndUpdate(
            { _id: assignment._id, version: assignment.version, status: "submitted_for_review" },
            {
                $set: {
                    status,
                    ...(decision === "approve" ? { completedAt: now } : { completedAt: null })
                },
                $inc: { version: 1 },
                $push: { history: {
                    action: decision === "approve" ? "review_approved" : "rework_requested",
                    actorUser: req.user.userId,
                    actorEmployee: req.user.employeeId,
                    fromStatus: "submitted_for_review",
                    toStatus: status,
                    note: note.slice(0, 2000)
                } }
            },
            { new: true, runValidators: true }
        );
        if (!saved) return fail(res, 409, "Work changed during review. Refresh and retry");
        return res.json({ success: true, message: decision === "approve" ? "Work approved and completed" : "Work returned for rework", data: await populateAssignment(WorkAssignment.findById(saved._id)) });
    } catch (error) {
        console.error("Review work assignment:", error.message);
        return fail(res, 500, "Unable to review work");
    }
};
