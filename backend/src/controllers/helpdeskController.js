import mongoose from "mongoose";
import HelpdeskTicket from "../models/HelpdeskTicket.js";
import User from "../models/User.js";

const isPrivileged = (role) => ["admin", "hr"].includes(role);
const categories = new Set(["hardware", "software", "ui_error", "network", "access", "other"]);
const priorities = new Set(["low", "medium", "high", "urgent"]);
const statuses = new Set(["open", "in_progress", "resolved", "closed"]);

const populateTicket = (query) => query
    .populate("createdBy", "employeeCode firstName lastName email")
    .populate({
        path: "assignedTo",
        select: "email role employee",
        populate: { path: "employee", select: "employeeCode firstName lastName" }
    })
    .populate("assignedBy", "email");

export const getHelpdeskWorkspace = async (req, res) => {
    try {
        const privileged = isPrivileged(req.user.role);
        const filter = privileged ? {} : { createdBy: req.user.employeeId };
        const [tickets, total, open, inProgress, resolved, closed, assigneeUsers] = await Promise.all([
            populateTicket(HelpdeskTicket.find(filter).sort({ createdAt: -1 }).limit(200)),
            HelpdeskTicket.countDocuments(filter),
            HelpdeskTicket.countDocuments({ ...filter, status: "open" }),
            HelpdeskTicket.countDocuments({ ...filter, status: "in_progress" }),
            HelpdeskTicket.countDocuments({ ...filter, status: "resolved" }),
            HelpdeskTicket.countDocuments({ ...filter, status: "closed" }),
            privileged
                ? User.find({ role: { $in: ["admin", "hr"] }, isActive: true })
                    .select("email role employee")
                    .populate({ path: "employee", match: { employmentStatus: "active" }, select: "employeeCode firstName lastName" })
                    .sort({ role: 1, email: 1 })
                : Promise.resolve([])
        ]);

        const assignees = assigneeUsers
            .filter((user) => user.employee)
            .map((user) => ({
                _id: user._id,
                email: user.email,
                role: user.role,
                employee: user.employee
            }));

        return res.json({
            success: true,
            data: {
                tickets,
                assignees,
                summary: { total, open, inProgress, resolved, closed }
            }
        });
    } catch (error) {
        console.error("Get Helpdesk workspace:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load Helpdesk workspace" });
    }
};

export const createHelpdeskTicket = async (req, res) => {
    try {
        const { category, priority = "medium", subject, description } = req.body || {};
        const cleanSubject = String(subject || "").trim();
        const cleanDescription = String(description || "").trim();

        if (!categories.has(category) || !priorities.has(priority) ||
            !cleanSubject || cleanSubject.length > 140 ||
            !cleanDescription || cleanDescription.length > 3000) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid category, priority, subject and description (subject max 140, description max 3000 characters)."
            });
        }

        const ticket = await HelpdeskTicket.create({
            createdBy: req.user.employeeId,
            category,
            priority,
            subject: cleanSubject,
            description: cleanDescription
        });
        const data = await populateTicket(HelpdeskTicket.findById(ticket._id));
        return res.status(201).json({
            success: true,
            message: "Support ticket submitted successfully",
            data
        });
    } catch (error) {
        console.error("Create Helpdesk ticket:", error.message);
        return res.status(500).json({ success: false, message: "Unable to submit support ticket" });
    }
};

export const assignHelpdeskTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedTo } = req.body || {};
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid ticket ID" });
        }

        let assignee = null;
        if (assignedTo !== null) {
            if (typeof assignedTo !== "string" || !mongoose.isValidObjectId(assignedTo)) {
                return res.status(400).json({ success: false, message: "Select a valid Admin or HR assignee" });
            }
            assignee = await User.findOne({
                _id: assignedTo,
                role: { $in: ["admin", "hr"] },
                isActive: true
            }).populate({ path: "employee", match: { employmentStatus: "active" }, select: "_id" });

            if (!assignee?.employee) {
                return res.status(400).json({ success: false, message: "Assignee must be an active Admin or HR account" });
            }
        }

        const ticket = await HelpdeskTicket.findById(id);
        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
        if (ticket.status === "closed") {
            return res.status(409).json({ success: false, message: "Closed tickets cannot be reassigned" });
        }

        ticket.assignedTo = assignee?._id || null;
        ticket.assignedBy = assignee ? req.user.userId : null;
        await ticket.save();

        const data = await populateTicket(HelpdeskTicket.findById(ticket._id));
        return res.json({ success: true, message: assignee ? "Ticket assigned successfully" : "Ticket assignment removed", data });
    } catch (error) {
        console.error("Assign Helpdesk ticket:", error.message);
        return res.status(500).json({ success: false, message: "Unable to assign support ticket" });
    }
};

export const updateHelpdeskTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, resolutionNote = "" } = req.body || {};
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid ticket ID" });
        }
        if (!statuses.has(status) || typeof resolutionNote !== "string" || resolutionNote.trim().length > 1000) {
            return res.status(400).json({ success: false, message: "Provide a valid ticket status and resolution note (max 1000 characters)" });
        }

        const ticket = await HelpdeskTicket.findById(id);
        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

        const allowedTransitions = {
            open: ["in_progress", "resolved"],
            in_progress: ["open", "resolved"],
            resolved: ["in_progress", "closed"],
            closed: []
        };
        if (status !== ticket.status && !allowedTransitions[ticket.status].includes(status)) {
            return res.status(409).json({
                success: false,
                message: `Cannot change a ${ticket.status.replace("_", " ")} ticket to ${status.replace("_", " ")}.`
            });
        }
        if (status === "closed" && ticket.status !== "resolved") {
            return res.status(409).json({ success: false, message: "Resolve the ticket before closing it" });
        }

        ticket.status = status;
        if (resolutionNote.trim()) ticket.resolutionNote = resolutionNote.trim();
        if (status === "resolved") ticket.resolvedAt = new Date();
        if (status === "closed") ticket.closedAt = new Date();
        if (status === "in_progress") {
            ticket.resolvedAt = null;
            ticket.closedAt = null;
        }
        await ticket.save();

        const data = await populateTicket(HelpdeskTicket.findById(ticket._id));
        return res.json({ success: true, message: "Ticket status updated successfully", data });
    } catch (error) {
        console.error("Update Helpdesk ticket status:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update ticket status" });
    }
};
