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
const original = { user: User.findById, session: Session.findOne };

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
