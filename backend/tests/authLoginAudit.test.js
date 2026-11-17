import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import User from "../src/models/User.js";
import Employee from "../src/models/Employee.js";
import AuditLog from "../src/models/AuditLog.js";
import { login } from "../src/controllers/authController.js";

const SECRET = "auth-login-audit-test-secret-with-at-least-32-characters";
const USER_ID = "64b000000000000000000011";
const EMPLOYEE_ID = "64b000000000000000000012";

const originals = {
    findOne: User.findOne,
    findById: Employee.findById,
    compare: bcrypt.compare,
    create: AuditLog.create
};

const runLogin = async ({ user, employee, passwordValid = true }) => {
    const logs = [];
    process.env.JWT_SECRET = SECRET;
    User.findOne = () => ({ select: async () => user });
    Employee.findById = async () => employee;
    bcrypt.compare = async () => passwordValid;
    AuditLog.create = async (entry) => { logs.push(entry); return entry; };

    const req = {
        body: { email: "person@example.com", password: "not-stored-password" },
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
        get: (name) => name === "user-agent" ? "HRMS auth test" : ""
    };
    let statusCode = 200;
    let responseBody;
    const res = {
        status(code) { statusCode = code; return this; },
        json(body) { responseBody = body; return this; }
    };

    try {
        await login(req, res);
        return { logs, statusCode, responseBody };
    } finally {
        User.findOne = originals.findOne;
        Employee.findById = originals.findById;
        bcrypt.compare = originals.compare;
        AuditLog.create = originals.create;
    }
};

test("Unknown-account login failure is audited without storing the submitted email", async () => {
    const result = await runLogin({ user: null, employee: null });

    assert.equal(result.statusCode, 401);
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].action, "login.failed");
    assert.equal(result.logs[0].actor, null);
    assert.equal(result.logs[0].role, "system");
    assert.equal(result.logs[0].statusCode, 401);
    assert.equal(JSON.stringify(result.logs[0]).includes("person@example.com"), false);
    assert.equal(JSON.stringify(result.logs[0]).includes("not-stored-password"), false);
});

test("Known-account wrong-password failure is audited against the account", async () => {
    const user = {
        _id: USER_ID,
        employee: EMPLOYEE_ID,
        role: "admin",
        isActive: true,
        passwordHash: "hash"
    };
    const result = await runLogin({
        user,
        employee: { _id: EMPLOYEE_ID, employmentStatus: "active" },
        passwordValid: false
    });

    assert.equal(result.statusCode, 401);
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].action, "login.failed");
    assert.equal(String(result.logs[0].actor), USER_ID);
    assert.equal(result.logs[0].role, "admin");
});

test("Successful login is audited with actor and HTTP success status", async () => {
    const user = {
        _id: USER_ID,
        employee: EMPLOYEE_ID,
        role: "admin",
        isActive: true,
        passwordHash: "hash",
        tokenVersion: 0,
        save: async () => {}
    };
    const result = await runLogin({
        user,
        employee: {
            _id: EMPLOYEE_ID,
            employmentStatus: "active",
            employeeCode: "EMP001",
            firstName: "Test",
            lastName: "User"
        }
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].action, "login.succeeded");
    assert.equal(String(result.logs[0].actor), USER_ID);
    assert.equal(result.logs[0].statusCode, 200);
    assert.equal(result.responseBody.success, true);
});
