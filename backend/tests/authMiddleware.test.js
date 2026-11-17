import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../src/models/User.js";
import { protect } from "../src/middleware/authMiddleware.js";

const SECRET = "auth-middleware-test-secret-with-at-least-32-characters";
const USER_ID = "64b000000000000000000011";

const originalFindById = User.findById;

test("protect forwards database failures to Express error handling", async () => {
    const databaseError = new Error("MongoDB temporarily unavailable");
    process.env.JWT_SECRET = SECRET;
    User.findById = () => ({
        select: async () => { throw databaseError; }
    });

    const req = {
        headers: {
            authorization: `Bearer ${jwt.sign({ userId: USER_ID, tokenVersion: 0 }, SECRET)}`
        }
    };
    let statusCode;
    let responseBody;
    let forwardedError;
    let nextCalled = false;
    const res = {
        status(code) { statusCode = code; return this; },
        json(body) { responseBody = body; return this; }
    };

    try {
        await protect(req, res, (error) => {
            if (error) forwardedError = error;
            else nextCalled = true;
        });

        assert.equal(forwardedError, databaseError);
        assert.equal(statusCode, undefined);
        assert.equal(responseBody, undefined);
        assert.equal(nextCalled, false);
    } finally {
        User.findById = originalFindById;
    }
});

test("protect still returns 401 for an invalid JWT", async () => {
    process.env.JWT_SECRET = SECRET;
    const req = { headers: { authorization: "Bearer invalid.token.value" } };
    let statusCode;
    let responseBody;
    let forwardedError;
    const res = {
        status(code) { statusCode = code; return this; },
        json(body) { responseBody = body; return this; }
    };

    await protect(req, res, (error) => { forwardedError = error; });

    assert.equal(statusCode, 401);
    assert.equal(responseBody.success, false);
    assert.equal(forwardedError, undefined);
});


test("protect uses the database role instead of an untrusted JWT role claim", async () => {
    const User = (await import("../src/models/User.js")).default;
    const Employee = (await import("../src/models/Employee.js")).default;
    const originalUserFindById = User.findById;
    const originalEmployeeFindById = Employee.findById;
    process.env.JWT_SECRET = SECRET;
    User.findById = () => ({
        select: async () => ({
            _id: USER_ID,
            employee: "64b000000000000000000012",
            role: "employee",
            isActive: true,
            tokenVersion: 0
        })
    });
    Employee.findById = () => ({
        select: async () => ({ _id: "64b000000000000000000012", employmentStatus: "active" })
    });

    const req = {
        headers: {
            authorization: `Bearer ${jwt.sign({ userId: USER_ID, role: "admin", tokenVersion: 0 }, SECRET)}`
        }
    };
    let nextCalled = false;
    const res = {
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };

    try {
        await protect(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(req.user.role, "employee");
        assert.equal(req.user.userId, USER_ID);
    } finally {
        User.findById = originalUserFindById;
        Employee.findById = originalEmployeeFindById;
    }
});

test("protect rejects JWTs signed with an algorithm other than HS256", async () => {
    process.env.JWT_SECRET = SECRET;
    const token = jwt.sign({ userId: USER_ID, tokenVersion: 0 }, SECRET, { algorithm: "HS384" });
    const req = { headers: { authorization: `Bearer ${token}` } };
    let statusCode;
    let nextCalled = false;
    const res = {
        status(code) { statusCode = code; return this; },
        json() { return this; }
    };

    await protect(req, res, () => { nextCalled = true; });
    assert.equal(statusCode, 401);
    assert.equal(nextCalled, false);
});
