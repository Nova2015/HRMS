import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../src/models/User.js";
import Employee from "../src/models/Employee.js";
import Session from "../src/models/Session.js";
import { protect } from "../src/middleware/authMiddleware.js";

const SECRET = "session-middleware-test-secret-with-at-least-32-characters";
const USER_ID = "64b000000000000000000021";
const EMPLOYEE_ID = "64b000000000000000000022";
const original = { user: User.findById, session: Session.findOne, employee: Employee.findById, update: Session.updateOne };

test("protect rejects a revoked individual session", async () => {
    process.env.JWT_SECRET = SECRET;
    User.findById = () => ({ select: async () => ({ _id: USER_ID, employee: EMPLOYEE_ID, role: "employee", isActive: true, tokenVersion: 0 }) });
    Session.findOne = () => ({ select: async () => null });
    const req = { headers: { authorization: "Bearer " + jwt.sign({ userId: USER_ID, tokenVersion: 0, jti: "revoked-session-id" }, SECRET) } };
    let code; let body;
    const res = { status(value) { code = value; return this; }, json(value) { body = value; return this; } };
    try {
        await protect(req, res, () => assert.fail("revoked session must not reach the route"));
        assert.equal(code, 401);
        assert.match(body.message, /signed out/i);
    } finally {
        User.findById = original.user;
        Session.findOne = original.session;
    }
});


test("protect skips lastSeenAt writes while session activity is recent", async () => {
    process.env.JWT_SECRET = SECRET;
    const calls = { updates: 0 };
    const now = new Date();
    User.findById = () => ({ select: async () => ({ _id: USER_ID, employee: EMPLOYEE_ID, role: "employee", isActive: true, tokenVersion: 0 }) });
    Session.findOne = () => ({ select: async () => ({ _id: "64b000000000000000000023", jti: "recent-session-id", lastSeenAt: now }) });
    Session.updateOne = async () => { calls.updates += 1; };
    Employee.findById = () => ({ select: async () => ({ _id: EMPLOYEE_ID, employmentStatus: "active" }) });
    const req = { headers: { authorization: "Bearer " + jwt.sign({ userId: USER_ID, tokenVersion: 0, jti: "recent-session-id" }, SECRET) } };
    const res = { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    try {
        await protect(req, res, () => {});
        assert.equal(calls.updates, 0);
        assert.equal(req.user.sessionJti, "recent-session-id");
    } finally {
        User.findById = original.user;
        Session.findOne = original.session;
        Session.updateOne = original.update;
        Employee.findById = original.employee;
    }
});

test("protect refreshes lastSeenAt when session activity is older than five minutes", async () => {
    process.env.JWT_SECRET = SECRET;
    const calls = { updates: 0 };
    User.findById = () => ({ select: async () => ({ _id: USER_ID, employee: EMPLOYEE_ID, role: "employee", isActive: true, tokenVersion: 0 }) });
    Session.findOne = () => ({ select: async () => ({ _id: "64b000000000000000000024", jti: "stale-session-id", lastSeenAt: new Date(Date.now() - 6 * 60 * 1000) }) });
    Session.updateOne = async () => { calls.updates += 1; };
    Employee.findById = () => ({ select: async () => ({ _id: EMPLOYEE_ID, employmentStatus: "active" }) });
    const req = { headers: { authorization: "Bearer " + jwt.sign({ userId: USER_ID, tokenVersion: 0, jti: "stale-session-id" }, SECRET) } };
    const res = { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    try {
        await protect(req, res, () => {});
        assert.equal(calls.updates, 1);
    } finally {
        User.findById = original.user;
        Session.findOne = original.session;
        Session.updateOne = original.update;
        Employee.findById = original.employee;
    }
});
