import test from "node:test";
import assert from "node:assert/strict";
import AuditLog from "../src/models/AuditLog.js";
import { auditAction } from "../src/middleware/auditLogMiddleware.js";

const runAudit = async (decision, statusCode = 200, options = {}) => {
    const originalCreate = AuditLog.create;
    let recorded = null;
    let finishHandler = null;

    AuditLog.create = async (entry) => {
        recorded = entry;
        return {};
    };

    try {
        const req = {
            user: { userId: "64b000000000000000000001", role: "admin", employeeId: "64b000000000000000000002" },
            body: { ...(decision === undefined ? {} : { decision }), ...(options.body || {}) },
            params: options.params || { id: "64b000000000000000000003" },
            route: { path: "/:id/review" },
            baseUrl: "/api/leaves",
            method: "PATCH",
            ip: "127.0.0.1",
            get: () => "HRMS test"
        };
        const res = {
            statusCode,
            once: (event, handler) => {
                assert.equal(event, "finish");
                finishHandler = handler;
            }
        };
        let nextCalled = false;

        auditAction("leaves", "leave.reviewed")(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        finishHandler();
        await new Promise((resolve) => setImmediate(resolve));
        return recorded;
    } finally {
        AuditLog.create = originalCreate;
    }
};

test("Audit log records approved outcome for approval decisions", async () => {
    const approved = await runAudit("approved");
    const approve = await runAudit("approve");

    assert.equal(approved.outcome, "approved");
    assert.equal(approve.outcome, "approved");
});

test("Audit log records rejected outcome for rejection decisions", async () => {
    const rejected = await runAudit("rejected");
    const reject = await runAudit("reject");

    assert.equal(rejected.outcome, "rejected");
    assert.equal(reject.outcome, "rejected");
});

test("Audit log leaves outcome empty for actions without a decision and records failed mutation attempts", async () => {
    const ordinaryAction = await runAudit(undefined);
    const failedAction = await runAudit("rejected", 400);

    assert.equal(ordinaryAction.outcome, "");
    assert.equal(failedAction.statusCode, 400);
    assert.equal(failedAction.action, "leave.reviewed.failed");
    assert.equal(failedAction.outcome, "");

    const serverFailure = await runAudit("approve", 500, {
        body: { password: "never-store-this", bankAccountNumber: "1234567890" }
    });
    assert.equal(serverFailure.statusCode, 500);
    assert.equal(serverFailure.action, "leave.reviewed.failed");
    assert.equal(serverFailure.outcome, "");
    assert.equal(JSON.stringify(serverFailure).includes("never-store-this"), false);
    assert.equal(JSON.stringify(serverFailure).includes("1234567890"), false);
});

test("Audit log identifies self-service and body-targeted employee resources", async () => {
    const selfService = await runAudit(undefined, 200, { params: {} });
    const bodyTargeted = await runAudit(undefined, 200, {
        params: {},
        body: { employeeId: "64b000000000000000000004" }
    });

    assert.equal(selfService.resourceId, "64b000000000000000000002");
    assert.equal(bodyTargeted.resourceId, "64b000000000000000000004");
});
