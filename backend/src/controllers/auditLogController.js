import AuditLog from "../models/AuditLog.js";

export const getAuditLogs = async (req, res) => {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
        const filter = {};

        if (req.query.module && req.query.module !== "all") {
            const allowed = ["employees", "attendance", "leaves", "payroll", "recruitment", "approvals", "performance", "auth", "expenses", "helpdesk", "holidays", "shifts"];
            if (!allowed.includes(req.query.module)) {
                return res.status(400).json({ success: false, message: "Invalid module filter" });
            }
            filter.module = req.query.module;
        }
        if (req.query.action && typeof req.query.action === "string") {
            const escapedAction = req.query.action.slice(0, 80).replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
            filter.action = { $regex: escapedAction, $options: "i" };
        }
        if (req.query.from || req.query.to) {
            const range = {};
            if (req.query.from) {
                const from = new Date(req.query.from);
                if (Number.isNaN(from.getTime())) return res.status(400).json({ success: false, message: "Invalid from date" });
                range.$gte = from;
            }
            if (req.query.to) {
                const to = new Date(req.query.to);
                if (Number.isNaN(to.getTime())) return res.status(400).json({ success: false, message: "Invalid to date" });
                to.setHours(23, 59, 59, 999);
                range.$lte = to;
            }
            if (range.$gte && range.$lte && range.$gte > range.$lte) {
                return res.status(400).json({ success: false, message: "From date must be on or before to date" });
            }
            filter.createdAt = range;
        }

        const [data, total] = await Promise.all([
            AuditLog.find(filter)
                .populate("actor", "email role")
                .populate("employee", "employeeCode firstName lastName")
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error("Load audit logs failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not load audit logs" });
    }
};
