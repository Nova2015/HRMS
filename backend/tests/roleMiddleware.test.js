import test from "node:test";
import assert from "node:assert/strict";
import AuditLog from "../src/models/AuditLog.js";
import { authorizeRoles } from "../src/middleware/roleMiddleware.js";
import helpdeskRoutes from "../src/routes/helpdeskRoutes.js";

const createResponse = () => {
    const response = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    return response;
};

test("authorizeRoles returns 401 when no authenticated user is present", () => {
    const middleware = authorizeRoles("admin", "hr");
    const req = {};
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(nextCalled, false);
});

test("authorizeRoles returns 403 and audits denied authenticated access without request data", async () => {
    const middleware = authorizeRoles("admin", "hr", "manager");
    const req = {
        user: { userId: "64b000000000000000000001", employeeId: "64b000000000000000000002", role: "employee" },
        method: "GET", baseUrl: "/api/payroll", path: "/salary-structures",
        body: { bankAccountNumber: "1234567890" }, ip: "127.0.0.1",
        get: () => "HRMS security test"
    };
    const res = createResponse();
    let nextCalled = false;

    const originalCreate = AuditLog.create;
    let recorded = null;
    AuditLog.create = async (entry) => { recorded = entry; return entry; };
    try {
        middleware(req, res, () => { nextCalled = true; });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.success, false);
        assert.equal(nextCalled, false);
        assert.equal(recorded.action, "access.denied");
        assert.equal(recorded.module, "security");
        assert.equal(recorded.statusCode, 403);
        assert.equal(recorded.route, "/api/payroll/salary-structures");
        assert.equal(JSON.stringify(recorded).includes("1234567890"), false);
    } finally {
        AuditLog.create = originalCreate;
    }
});

test("Approval Inbox role allowlist accepts admin, hr and manager", () => {
    const middleware = authorizeRoles("admin", "hr", "manager");

    for (const role of ["admin", "hr", "manager"]) {
        const req = { user: { role } };
        const res = createResponse();
        let nextCalled = false;

        middleware(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true, `expected ${role} to pass the Approval Inbox role guard`);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body, null);
    }
});

test("Team Leader may update own Helpdesk tickets but cannot assign tickets", () => {
    const statusRoute = helpdeskRoutes.stack.find((layer) =>
        layer.route?.path === "/tickets/:id/status" && layer.route.methods.patch
    );
    const assignRoute = helpdeskRoutes.stack.find((layer) =>
        layer.route?.path === "/tickets/:id/assign" && layer.route.methods.patch
    );
    assert.ok(statusRoute);
    assert.ok(assignRoute);

    const teamLeader = { user: { role: "team_leader" } };
    const statusResponse = createResponse();
    let statusNextCalled = false;
    statusRoute.route.stack[0].handle(teamLeader, statusResponse, () => { statusNextCalled = true; });
    assert.equal(statusNextCalled, true);

    const assignResponse = createResponse();
    let assignNextCalled = false;
    assignRoute.route.stack[0].handle(teamLeader, assignResponse, () => { assignNextCalled = true; });
    assert.equal(assignNextCalled, false);
    assert.equal(assignResponse.statusCode, 403);
});

test("Team Leader is not granted manager-only approval permissions", () => {
    const middleware = authorizeRoles("admin", "hr", "manager");
    const req = { user: { role: "team_leader" } };
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
});

test("Expense and Employee Update decision allowlist excludes manager and employee", () => {
    const middleware = authorizeRoles("admin", "hr");

    for (const role of ["manager", "team_leader", "employee"]) {
        const req = { user: { role } };
        const res = createResponse();
        let nextCalled = false;

        middleware(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
    }
});
