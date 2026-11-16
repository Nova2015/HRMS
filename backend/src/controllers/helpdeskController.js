import mongoose from "mongoose";
import HelpdeskTicket from "../models/HelpdeskTicket.js";
import User from "../models/User.js";
import Employee from "../models/Employee.js";

const getWorkspaceAccess = async (req) => {
    if (req.user.role === "admin" || req.user.role === "hr") {
        return { filter: {}, canManage: true, organizationWide: true, departmentId: null, role: req.user.role };
    }

    const employee = await Employee.findById(req.user.employeeId)
        .select("_id department designation")
        .populate("designation", "name");

    if (!employee) return { filter: { _id: null }, canManage: false, organizationWide: false, departmentId: null };

    const isFounder = String(employee.designation?.name || "").trim().toLowerCase() === "founder";
    if (req.user.role === "manager" && isFounder) {
        return { filter: { ticketType: { $ne: "hr_private" } }, canManage: true, organizationWide: true, departmentId: null, role: req.user.role };
    }

    if (req.user.role === "manager") {
        const departmentEmployees = await Employee.find({
            department: employee.department,
            employmentStatus: "active"
        }).distinct("_id");
        const departmentUsers = await User.find({
            employee: { $in: departmentEmployees },
            isActive: true
        }).distinct("_id");
        return {
            filter: {
                ticketType: { $ne: "hr_private" },
                $or: [
                    { createdBy: { $in: departmentEmployees } },
                    { assignedTo: { $in: departmentUsers } }
                ]
            },
            canManage: true,
            organizationWide: false,
            departmentId: employee.department.toString(),
            departmentEmployeeIds: departmentEmployees,
            departmentUserIds: departmentUsers
        };
    }

    return {
        filter: {
            $or: [
                { createdBy: req.user.employeeId },
                { assignedTo: req.user.userId }
            ]
        },
        canManage: false,
        organizationWide: false,
        departmentId: employee.department.toString()
    };
};
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
        const access = await getWorkspaceAccess(req);
        const filter = access.filter;
        const [tickets, total, open, inProgress, resolved, closed, assigneeUsers] = await Promise.all([
            populateTicket(HelpdeskTicket.find(filter).sort({ createdAt: -1 }).limit(200)),
            HelpdeskTicket.countDocuments(filter),
            HelpdeskTicket.countDocuments({ ...filter, status: "open" }),
            HelpdeskTicket.countDocuments({ ...filter, status: "in_progress" }),
            HelpdeskTicket.countDocuments({ ...filter, status: "resolved" }),
            HelpdeskTicket.countDocuments({ ...filter, status: "closed" }),
            access.canManage
                ? User.find({
                    ...(access.organizationWide ? {} : { employee: { $in: access.departmentEmployeeIds || [] } }),
                    isActive: true,
                    role: access.organizationWide ? { $in: ["admin", "hr", "manager", "employee"] } : { $in: ["manager", "employee"] }
                })
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
                summary: { total, open, inProgress, resolved, closed },
                permissions: {
                    canManage: access.canManage,
                    organizationWide: access.organizationWide,
                    departmentId: access.departmentId
                }
            }
        });
    } catch (error) {
        console.error("Get Helpdesk workspace:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load Helpdesk workspace" });
    }
};

export const createHelpdeskTicket = async (req, res) => {
    try {
        const { category, priority = "medium", subject, description, ticketType = "helpdesk", dueDate = null } = req.body || {};
        const access = await getWorkspaceAccess(req);
        const allowedTypes = req.user.role === "admin" || req.user.role === "hr"
            ? new Set(["work_task", "helpdesk", "hr_private"])
            : req.user.role === "manager"
                ? new Set(["work_task", "helpdesk"])
                : new Set(["helpdesk"]);
        if (!allowedTypes.has(ticketType)) {
            return res.status(403).json({ success: false, message: "You are not allowed to create this ticket type" });
        }
        if (dueDate && (Number.isNaN(Date.parse(dueDate)) || new Date(dueDate) < new Date("2000-01-01"))) {
            return res.status(400).json({ success: false, message: "Provide a valid due date" });
        }
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
            ticketType,
            dueDate: dueDate ? new Date(dueDate) : null,
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
        const access = await getWorkspaceAccess(req);
        if (!access.canManage) return res.status(403).json({ success: false, message: "You are not allowed to assign tickets" });
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid ticket ID" });
        }

        let assignee = null;
        if (assignedTo !== null) {
            if (typeof assignedTo !== "string" || !mongoose.isValidObjectId(assignedTo)) {
                return res.status(400).json({ success: false, message: "Select a valid Admin or HR assignee" });
            }
            const assigneeQuery = {
                _id: assignedTo,
                isActive: true,
                ...(access.organizationWide ? { role: { $in: ["admin", "hr", "manager", "employee"] } } : {
                    role: { $in: ["manager", "employee"] },
                    employee: { $in: access.departmentEmployeeIds || [] }
                })
            };
            assignee = await User.findOne(assigneeQuery)
                .populate({ path: "employee", match: { employmentStatus: "active" }, select: "_id department" });

            if (!assignee?.employee) {
                return res.status(400).json({ success: false, message: "Assignee must be an active Admin or HR account" });
            }
            if (!access.organizationWide && assignee.employee.department?.toString() !== access.departmentId) {
                return res.status(403).json({ success: false, message: "You can assign work only within your department" });
            }
        }

        const ticket = await HelpdeskTicket.findOne({ _id: id, ...access.filter });
        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
        if (ticket.ticketType === "hr_private" && assignee && !["admin", "hr"].includes(assignee.role)) {
            return res.status(403).json({ success: false, message: "Private HR requests can be assigned only to Admin or HR" });
        }
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
        const access = await getWorkspaceAccess(req);
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid ticket ID" });
        }
        if (!statuses.has(status) || typeof resolutionNote !== "string" || resolutionNote.trim().length > 1000) {
            return res.status(400).json({ success: false, message: "Provide a valid ticket status and resolution note (max 1000 characters)" });
        }

        const ticket = await HelpdeskTicket.findOne({ _id: id, ...access.filter });
        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
        const isCreator = ticket.createdBy.toString() === req.user.employeeId;
        const isAssignee = ticket.assignedTo?.toString() === req.user.userId;
        if (!access.canManage && !isCreator && !isAssignee) {
            return res.status(403).json({ success: false, message: "You cannot update this ticket" });
        }

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
