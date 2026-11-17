import test from "node:test";
import assert from "node:assert/strict";
import { authorizeRoles } from "../src/middleware/roleMiddleware.js";

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

test("authorizeRoles returns 403 when the authenticated role is not allowed", () => {
    const middleware = authorizeRoles("admin", "hr", "manager");
    const req = { user: { role: "employee" } };
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(nextCalled, false);
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

test("Expense and Employee Update decision allowlist excludes manager and employee", () => {
    const middleware = authorizeRoles("admin", "hr");

    for (const role of ["manager", "employee"]) {
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
