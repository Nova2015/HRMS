import AuditLog from "../models/AuditLog.js";

export const auditAction = (module, action) => (req, res, next) => {
    const actor = req.user;
    if (!actor?.userId || !actor?.role) return next();

    res.once("finish", () => {
        // Record successful mutations and failed attempts, but ignore redirects.
        // Request bodies are deliberately excluded from audit records.
        const statusCode = res.statusCode;
        if (!((statusCode >= 200 && statusCode < 300) || statusCode >= 400)) return;

        const routePath = req.route?.path || "";
        const route = `${req.baseUrl || ""}${routePath}`.slice(0, 240);
        const resourceId = String(
            req.params?.id ||
            req.params?.employeeId ||
            req.params?.candidateId ||
            req.params?.jobId ||
            req.body?.employeeId ||
            actor.employeeId ||
            ""
        ).slice(0, 80);

        const submittedDecision = req.body?.decision;
        const outcome = statusCode >= 200 && statusCode < 300
            ? submittedDecision === "approved" || submittedDecision === "approve"
                ? "approved"
                : submittedDecision === "rejected" || submittedDecision === "reject"
                    ? "rejected"
                    : ""
            : "";

        AuditLog.create({
            actor: actor.userId,
            employee: actor.employeeId || null,
            role: actor.role,
            action,
            module,
            method: req.method,
            route,
            resourceId,
            outcome,
            statusCode,
            ipAddress: String(req.ip || "").slice(0, 80),
            userAgent: String(req.get("user-agent") || "").slice(0, 300)
        }).catch((error) => {
            console.error("Audit log write failed:", error.message);
        });
    });

    next();
};
