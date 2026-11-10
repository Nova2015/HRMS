import AuditLog from "../models/AuditLog.js";

export const auditAction = (module, action) => (req, res, next) => {
    const actor = req.user;
    if (!actor?.userId || !actor?.role) return next();

    res.once("finish", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;

        const routePath = req.route?.path || "";
        const route = `${req.baseUrl || ""}${routePath}`.slice(0, 240);
        const resourceId = String(
            req.params?.id || req.params?.employeeId || req.params?.candidateId || req.params?.jobId || ""
        ).slice(0, 80);

        AuditLog.create({
            actor: actor.userId,
            employee: actor.employeeId || null,
            role: actor.role,
            action,
            module,
            method: req.method,
            route,
            resourceId,
            statusCode: res.statusCode,
            ipAddress: String(req.ip || "").slice(0, 80),
            userAgent: String(req.get("user-agent") || "").slice(0, 300)
        }).catch((error) => {
            console.error("Audit log write failed:", error.message);
        });
    });

    next();
};
