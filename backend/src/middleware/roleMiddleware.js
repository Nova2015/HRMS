import AuditLog from "../models/AuditLog.js";

const recordAccessDenied = (req) => {
    const actor = req.user;
    if (!actor?.userId || !actor?.role) return;

    const route = `${req.baseUrl || ""}${req.route?.path || req.path || ""}`.slice(0, 240);
    AuditLog.create({
        actor: actor.userId,
        employee: actor.employeeId || null,
        role: actor.role,
        action: "access.denied",
        module: "security",
        method: String(req.method || "").slice(0, 10),
        route,
        resourceId: String(req.params?.id || req.params?.employeeId || "").slice(0, 80),
        outcome: "",
        statusCode: 403,
        ipAddress: String(req.ip || "").slice(0, 80),
        userAgent: String(req.get?.("user-agent") || "").slice(0, 300)
    }).catch((error) => {
        console.error("Access-denied audit write failed:", error.message);
    });
};

export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            recordAccessDenied(req);
            return res.status(403).json({
                success: false,
                message: "Access denied. Insufficient permissions."
            });
        }

        next();
    };
};
