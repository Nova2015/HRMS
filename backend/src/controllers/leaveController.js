import mongoose from "mongoose";
import LeaveRequest from "../models/LeaveRequest.js";
import Employee from "../models/Employee.js";

const ALLOWED_LEAVE_TYPES = ["casual", "sick", "earned", "unpaid"];
const REVIEW_ROLES = ["admin", "hr"];

const isValidDateKey = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
};

const countCalendarDays = (startDate, endDate) => {
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T00:00:00.000Z");
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
};

const populateLeave = (query) => query
    .populate("employee", "employeeCode firstName lastName email department")
    .populate("reviewedBy", "email role");

const canReview = (role) => REVIEW_ROLES.includes(role);

// CREATE LEAVE REQUEST - employee submits for their own account.
export const createLeaveRequest = async (req, res) => {
    try {
        const { leaveType, startDate, endDate, reason } = req.body;

        if (!ALLOWED_LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({
                success: false,
                message: "Select a valid leave type"
            });
        }

        if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
            return res.status(400).json({
                success: false,
                message: "Valid start and end dates are required (YYYY-MM-DD)"
            });
        }

        if (endDate < startDate) {
            return res.status(400).json({
                success: false,
                message: "End date cannot be before start date"
            });
        }

        const cleanReason = String(reason || "").trim();
        if (cleanReason.length < 5 || cleanReason.length > 1000) {
            return res.status(400).json({
                success: false,
                message: "Reason must contain 5 to 1000 characters"
            });
        }

        const employee = await Employee.findById(req.user.employeeId);
        if (!employee || employee.employmentStatus !== "active") {
            return res.status(403).json({
                success: false,
                message: "Active employee account required"
            });
        }

        const overlapping = await LeaveRequest.findOne({
            employee: employee._id,
            status: { $in: ["pending", "approved"] },
            startDate: { $lte: endDate },
            endDate: { $gte: startDate }
        });

        if (overlapping) {
            return res.status(409).json({
                success: false,
                message: "This date range overlaps an existing pending or approved leave request"
            });
        }

        const leave = await LeaveRequest.create({
            employee: employee._id,
            leaveType,
            startDate,
            endDate,
            totalDays: countCalendarDays(startDate, endDate),
            reason: cleanReason
        });

        const data = await populateLeave(LeaveRequest.findById(leave._id));

        return res.status(201).json({
            success: true,
            message: "Leave request submitted successfully",
            data
        });
    } catch (error) {
        console.error("Create leave request error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to submit leave request"
        });
    }
};

// EMPLOYEE: own requests. ADMIN/HR: company-wide register.
export const getLeaveRequests = async (req, res) => {
    try {
        const filter = {};
        if (!canReview(req.user.role)) {
            filter.employee = req.user.employeeId;
        } else {
            const { status, employeeId } = req.query;
            if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) {
                filter.status = status;
            }
            if (employeeId) {
                if (!mongoose.isValidObjectId(employeeId)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid employee ID"
                    });
                }
                filter.employee = employeeId;
            }
        }

        const data = await populateLeave(
            LeaveRequest.find(filter).sort({ createdAt: -1 }).limit(500)
        );

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error("Get leave requests error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load leave requests"
        });
    }
};

// ADMIN/HR: approve or reject a pending request.
export const reviewLeaveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { decision, reviewComment = "" } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid leave request ID"
            });
        }

        if (!["approved", "rejected"].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Decision must be approved or rejected"
            });
        }

        const comment = String(reviewComment).trim();
        if (comment.length > 1000) {
            return res.status(400).json({
                success: false,
                message: "Review comment cannot exceed 1000 characters"
            });
        }

        const leave = await LeaveRequest.findOneAndUpdate(
            { _id: id, status: "pending" },
            {
                $set: {
                    status: decision,
                    reviewedBy: req.user.userId,
                    reviewedAt: new Date(),
                    reviewComment: comment
                }
            },
            { new: true, runValidators: true }
        );

        if (!leave) {
            const exists = await LeaveRequest.exists({ _id: id });
            return res.status(exists ? 409 : 404).json({
                success: false,
                message: exists
                    ? "Only pending leave requests can be reviewed"
                    : "Leave request not found"
            });
        }

        const data = await populateLeave(LeaveRequest.findById(leave._id));

        return res.status(200).json({
            success: true,
            message: `Leave request ${decision} successfully`,
            data
        });
    } catch (error) {
        console.error("Review leave request error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to review leave request"
        });
    }
};

// EMPLOYEE: cancel own pending request only.
export const cancelLeaveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid leave request ID"
            });
        }

        const leave = await LeaveRequest.findOneAndUpdate(
            {
                _id: id,
                employee: req.user.employeeId,
                status: "pending"
            },
            { $set: { status: "cancelled" } },
            { new: true, runValidators: true }
        );

        if (!leave) {
            const exists = await LeaveRequest.exists({
                _id: id,
                employee: req.user.employeeId
            });
            return res.status(exists ? 409 : 404).json({
                success: false,
                message: exists
                    ? "Only your pending leave requests can be cancelled"
                    : "Leave request not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Leave request cancelled successfully",
            data: leave
        });
    } catch (error) {
        console.error("Cancel leave request error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to cancel leave request"
        });
    }
};
