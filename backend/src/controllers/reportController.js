import Attendance from "../models/Attendance.js";
import Employee from "../models/Employee.js";
import LeaveRequest from "../models/LeaveRequest.js";
import Payroll from "../models/Payroll.js";
import PerformanceReview from "../models/PerformanceReview.js";

const isDateKey = (value) => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(value + "T00:00:00.000Z").getTime()) &&
    new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;

export const getReportsSummary = async (req, res) => {
    try {
        const now = new Date();
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
        const defaultFrom = today.slice(0, 8) + "01";
        const from = req.query.from || defaultFrom;
        const to = req.query.to || today;

        if (!isDateKey(from) || !isDateKey(to) || from > to) {
            return res.status(400).json({ success: false, message: "Provide a valid date range (YYYY-MM-DD)" });
        }
        const span = (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000;
        if (span > 366) {
            return res.status(400).json({ success: false, message: "Report date range cannot exceed 367 days" });
        }

        const activeEmployeeFilter = { employmentStatus: "active", isTestRecord: { $ne: true } };
        const payrollFrom = from.slice(0, 7);
        const payrollTo = to.slice(0, 7);
        const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
        const performanceYearFilter = years.length === 1
            ? { period: new RegExp("^" + years[0] + "-") }
            : { $or: years.map((year) => ({ period: new RegExp("^" + year + "-") })) };

        const [activeEmployees, totalEmployees, attendance, leave, payroll, performance, departments] = await Promise.all([
            Employee.countDocuments(activeEmployeeFilter),
            Employee.countDocuments({ isTestRecord: { $ne: true } }),
            Attendance.aggregate([
                { $match: { dateKey: { $gte: from, $lte: to } } },
                { $group: { _id: "$status", count: { $sum: 1 }, late: { $sum: { $cond: ["$isLate", 1, 0] } }, workMinutes: { $sum: "$workMinutes" } } }
            ]),
            LeaveRequest.aggregate([
                { $match: { startDate: { $lte: to }, endDate: { $gte: from } } },
                { $group: { _id: "$status", requests: { $sum: 1 }, days: { $sum: "$totalDays" } } }
            ]),
            Payroll.aggregate([
                { $match: { period: { $gte: payrollFrom, $lte: payrollTo } } },
                { $group: { _id: "$status", records: { $sum: 1 }, netPay: { $sum: "$netPay" }, grossPay: { $sum: "$grossEarnings" } } }
            ]),
            PerformanceReview.aggregate([
                { $match: performanceYearFilter },
                { $group: { _id: "$status", reviews: { $sum: 1 }, ratedReviews: { $sum: { $cond: [{ $isNumber: "$managerReview.rating" }, 1, 0] } }, averageRating: { $avg: "$managerReview.rating" } } }
            ]),
            Employee.aggregate([
                { $match: activeEmployeeFilter },
                { $lookup: { from: "departments", localField: "department", foreignField: "_id", as: "departmentInfo" } },
                { $unwind: { path: "$departmentInfo", preserveNullAndEmptyArrays: true } },
                { $group: { _id: "$departmentInfo.name", employees: { $sum: 1 } } },
                { $sort: { employees: -1, _id: 1 } },
                { $limit: 20 }
            ])
        ]);

        const attendanceSummary = { present: 0, "half-day": 0, absent: 0, late: 0, workMinutes: 0 };
        attendance.forEach((item) => {
            attendanceSummary[item._id] = item.count;
            attendanceSummary.late += item.late;
            attendanceSummary.workMinutes += item.workMinutes;
        });
        const leaveSummary = { pending: 0, approved: 0, rejected: 0, cancelled: 0, totalRequests: 0, totalDays: 0 };
        leave.forEach((item) => {
            leaveSummary[item._id] = item.requests;
            leaveSummary.totalRequests += item.requests;
            leaveSummary.totalDays += item.days;
        });
        const payrollSummary = { processedRecords: 0, paidRecords: 0, processedNetPay: 0, paidNetPay: 0, grossPay: 0 };
        payroll.forEach((item) => {
            if (item._id === "paid") {
                payrollSummary.paidRecords = item.records;
                payrollSummary.paidNetPay = item.netPay;
            } else {
                payrollSummary.processedRecords = item.records;
                payrollSummary.processedNetPay = item.netPay;
            }
            payrollSummary.grossPay += item.grossPay;
        });
        const performanceSummary = { pending: 0, selfSubmitted: 0, managerReviewed: 0, finalized: 0, averageRating: null, totalReviews: 0 };
        let ratingWeightedTotal = 0;
        let ratedReviews = 0;
        performance.forEach((item) => {
            const key = ({ self_submitted: "selfSubmitted", manager_reviewed: "managerReviewed" })[item._id] || item._id;
            if (Object.prototype.hasOwnProperty.call(performanceSummary, key) && key !== "averageRating" && key !== "totalReviews") performanceSummary[key] = item.reviews;
            performanceSummary.totalReviews += item.reviews;
            if (item.averageRating !== null) {
                ratingWeightedTotal += item.averageRating * item.ratedReviews;
                ratedReviews += item.ratedReviews;
            }
        });
        performanceSummary.averageRating = ratedReviews ? Math.round((ratingWeightedTotal / ratedReviews) * 100) / 100 : null;

        return res.json({
            success: true,
            data: {
                range: { from, to },
                employees: { active: activeEmployees, total: totalEmployees, inactive: Math.max(0, totalEmployees - activeEmployees) },
                attendance: attendanceSummary,
                leave: leaveSummary,
                payroll: payrollSummary,
                performance: performanceSummary,
                departments: departments.map((item) => ({ name: item._id || "Unassigned", employees: item.employees }))
            }
        });
    } catch (error) {
        console.error("Reports summary:", error.message);
        return res.status(500).json({ success: false, message: "Unable to generate reports" });
    }
};
