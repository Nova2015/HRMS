import mongoose from "mongoose";
import LeaveAllocation from "../models/LeaveAllocation.js";
import LeaveRequest from "../models/LeaveRequest.js";
import Employee from "../models/Employee.js";
import { isTransactionUnavailable } from "../utils/isTransactionUnavailable.js";

const TYPES = ["casual", "sick", "earned"];
const validYear = (value) => /^\d{4}$/.test(String(value)) && Number(value) >= 2000 && Number(value) <= 2100;

const summarize = async (allocations, year) => {
    const employeeIds = allocations.map((item) => item.employee?._id || item.employee).filter(Boolean);
    const requests = await LeaveRequest.find({
        employee: { $in: employeeIds },
        status: { $in: ["pending", "approved"] },
        startDate: { $gte: String(year) + "-01-01", $lte: String(year) + "-12-31" },
        leaveType: { $in: TYPES }
    }).select("employee leaveType totalDays");
    const usage = new Map();
    for (const request of requests) {
        const key = request.employee.toString() + ":" + request.leaveType;
        usage.set(key, (usage.get(key) || 0) + request.totalDays);
    }
    return allocations.map((item) => {
        const employeeId = (item.employee?._id || item.employee).toString();
        const result = { ...item.toObject(), balances: {} };
        for (const type of TYPES) {
            const allocated = item[type] || 0;
            const reserved = usage.get(employeeId + ":" + type) || 0;
            result.balances[type] = { allocated, reserved, available: Math.max(0, allocated - reserved) };
        }
        return result;
    });
};

export const getLeaveAllocations = async (req, res) => {
    try {
        const year = req.query.year || String(new Date().getFullYear());
        if (!validYear(year)) return res.status(400).json({ success: false, message: "Select a valid allocation year" });
        const filter = { year: Number(year) };
        if (req.user.role !== "admin" && req.user.role !== "hr") {
            if (!req.user.employeeId) return res.status(403).json({ success: false, message: "Employee account required" });
            filter.employee = req.user.employeeId;
        } else if (req.query.employeeId) {
            if (!mongoose.isValidObjectId(req.query.employeeId)) return res.status(400).json({ success: false, message: "Invalid employee ID" });
            filter.employee = req.query.employeeId;
        }
        const allocations = await LeaveAllocation.find(filter)
            .populate("employee", "employeeCode firstName lastName employmentStatus");
        const data = await summarize(allocations, Number(year));
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Get leave allocations error:", error);
        return res.status(500).json({ success: false, message: "Unable to load leave balances" });
    }
};

export const saveLeaveAllocation = async (req, res) => {
    try {
        const { employeeId, year, casual, sick, earned } = req.body;
        if (!mongoose.isValidObjectId(employeeId)) return res.status(400).json({ success: false, message: "Select a valid employee" });
        if (!validYear(year)) return res.status(400).json({ success: false, message: "Select a valid allocation year" });
        const values = { casual, sick, earned };
        for (const type of TYPES) {
            if (!Number.isInteger(values[type]) || values[type] < 0 || values[type] > 366) {
                return res.status(400).json({ success: false, message: type + " leave must be a whole number between 0 and 366" });
            }
        }
        const employee = await Employee.findOne({ _id: employeeId, employmentStatus: "active", isArchived: { $ne: true } }).select("_id");
        if (!employee) return res.status(404).json({ success: false, message: "Active employee not found" });
        const session = await mongoose.startSession();
        let allocation;
        try {
            await session.withTransaction(async () => {
                // Use the same employee-document lock as leave submission so
                // allocation changes and new leave reservations serialize.
                const lock = await Employee.updateOne(
                    { _id: employee._id, employmentStatus: "active", isArchived: { $ne: true } },
                    { $inc: { leaveRequestVersion: 1 } },
                    { session }
                );
                if (lock.matchedCount !== 1) {
                    const inactive = new Error("Active employee not found");
                    inactive.code = 40401;
                    throw inactive;
                }

                const existingUsage = await LeaveRequest.aggregate([
                    { $match: {
                        employee: employee._id,
                        status: { $in: ["pending", "approved"] },
                        startDate: { $gte: String(Number(year)) + "-01-01", $lte: String(Number(year)) + "-12-31" },
                        leaveType: { $in: TYPES }
                    } },
                    { $group: { _id: "$leaveType", total: { $sum: "$totalDays" } } }
                ]).session(session);
                const usedByType = new Map(existingUsage.map((item) => [item._id, item.total]));
                for (const type of TYPES) {
                    if (values[type] < (usedByType.get(type) || 0)) {
                        const conflict = new Error("Cannot reduce " + type + " allocation below " + usedByType.get(type) + " day(s) already pending or approved.");
                        conflict.code = 40901;
                        throw conflict;
                    }
                }

                allocation = await LeaveAllocation.findOneAndUpdate(
                    { employee: employeeId, year: Number(year) },
                    { $set: { ...values, updatedBy: req.user.userId } },
                    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session }
                ).populate("employee", "employeeCode firstName lastName employmentStatus");
            });
        } finally {
            await session.endSession();
        }
        const [data] = await summarize([allocation], Number(year));
        return res.status(200).json({ success: true, message: "Leave allocation saved successfully", data });
    } catch (error) {
        console.error("Save leave allocation error:", error);
        const status = error.code === 40401 || error.code === 40901 || error.code === 11000 ? 409 : isTransactionUnavailable(error) ? 503 : 500;
        const message = error.code === 40401
            ? "Active employee not found"
            : error.code === 40901
                ? error.message
                : error.code === 11000
                    ? "Leave allocation already exists. Refresh and try again."
                    : isTransactionUnavailable(error)
                    ? "Leave allocation is temporarily unavailable; please retry."
                    : "Unable to save leave allocation";
        return res.status(status).json({ success: false, message });
    }
};
