import EmployeeUpdateApproval from "../models/EmployeeUpdateApproval.js";
import ExpenseClaim from "../models/ExpenseClaim.js";
import LeaveRequest from "../models/LeaveRequest.js";
import Employee from "../models/Employee.js";

const validStatuses = new Set(["pending", "approved", "rejected", "all"]);

export const getApprovalInbox = async (req, res) => {
    try {
        const role = req.user.role;
        const status = validStatuses.has(req.query.status) ? req.query.status : "pending";
        const statusFilter = status === "all" ? {} : { status };
        const isCompanyReviewer = role === "admin" || role === "hr";

        const leaveFilter = { ...statusFilter };
        if (role === "manager") {
            const teamIds = await Employee.find({
                reportingManager: req.user.employeeId
            }).distinct("_id");
            leaveFilter.employee = { $in: teamIds };
        }

        const [leaves, expenses, updates] = await Promise.all([
            LeaveRequest.find(leaveFilter)
                .populate("employee", "employeeCode firstName lastName")
                .sort({ createdAt: -1 }).limit(200).lean(),
            isCompanyReviewer
                ? ExpenseClaim.find(statusFilter)
                    .populate("employee", "employeeCode firstName lastName")
                    .sort({ createdAt: -1 }).limit(200).lean()
                : Promise.resolve([]),
            isCompanyReviewer
                ? EmployeeUpdateApproval.find(statusFilter)
                    .populate("employee", "employeeCode firstName lastName")
                    .populate("requestedBy", "email role")
                    .populate("decidedBy", "email role")
                    .sort({ createdAt: -1 }).limit(200).lean()
                : Promise.resolve([])
        ]);

        const employeeSummary = (employee) => employee ? {
            id: employee._id,
            employeeCode: employee.employeeCode || "",
            name: [employee.firstName, employee.lastName].filter(Boolean).join(" ")
        } : { id: null, employeeCode: "", name: "Employee record unavailable" };

        const data = [
            ...leaves.map((item) => ({
                id: item._id,
                type: "leave",
                status: item.status,
                createdAt: item.createdAt,
                employee: employeeSummary(item.employee),
                details: {
                    leaveType: item.leaveType,
                    startDate: item.startDate,
                    endDate: item.endDate,
                    totalDays: item.totalDays,
                    reason: item.reason,
                    reviewComment: item.reviewComment || ""
                }
            })),
            ...expenses.map((item) => ({
                id: item._id,
                type: "expense",
                status: item.status,
                createdAt: item.createdAt,
                employee: employeeSummary(item.employee),
                details: {
                    category: item.category,
                    amount: item.amount,
                    expenseDate: item.expenseDate,
                    merchant: item.merchant || "",
                    description: item.description,
                    receiptOriginalName: item.receiptOriginalName,
                    overLimitAtSubmission: Boolean(item.overLimitAtSubmission),
                    reviewComment: item.reviewComment || ""
                }
            })),
            ...updates.map((item) => ({
                id: item._id,
                type: "employee-update",
                status: item.status,
                createdAt: item.createdAt,
                employee: employeeSummary(item.employee),
                details: {
                    employeeCode: item.employeeCode,
                    source: item.source,
                    sourceReference: item.sourceReference || "",
                    sourceSubject: item.sourceSubject || "",
                    proposedChanges: item.proposedChanges || {},
                    oldValues: item.oldValues || {},
                    decisionNote: item.decisionNote || "",
                    requestedBy: item.requestedBy?.email || "",
                    decidedBy: item.decidedBy?.email || "",
                    decidedAt: item.decidedAt || null
                }
            }))
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error("Approval inbox error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load approval inbox"
        });
    }
};
