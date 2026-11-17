import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Employee from "../src/models/Employee.js";
import User from "../src/models/User.js";
import Session from "../src/models/Session.js";
import { resetEmployeePassword } from "../src/controllers/employeeController.js";
import { protect } from "../src/middleware/authMiddleware.js";

const EMPLOYEE_ID = "64b000000000000000000041";
const USER_ID = "64b000000000000000000042";
const TEST_PASSWORD = "p".repeat(16);
const TEST_JWT_SECRET = "x".repeat(48);
const originals = {
    employeeFindById: Employee.findById,
    userFindOne: User.findOne,
    hash: bcrypt.hash,
    userFindById: User.findById,
    sessionFindOne: Session.findOne
};

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

test("employee password reset hashes the password and increments tokenVersion", async () => {
    const user = {
        _id: USER_ID,
        tokenVersion: 7,
        passwordHash: "old-hash",
        async save() { this.saved = true; }
    };
    Employee.findById = () => ({ select: async () => ({ _id: EMPLOYEE_ID }) });
    User.findOne = () => ({ select: async () => user });
    bcrypt.hash = async (password, rounds) => {
        assert.equal(password, TEST_PASSWORD);
        assert.equal(rounds, 12);
        return "new-hash";
    };

    try {
        const res = response();
        await resetEmployeePassword({ params: { id: EMPLOYEE_ID }, body: { newPassword: TEST_PASSWORD } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(user.passwordHash, "new-hash");
        assert.equal(user.tokenVersion, 8);
        assert.equal(user.saved, true);
        assert.match(res.body.message, /All existing sessions have been signed out/);
    } finally {
        Employee.findById = originals.employeeFindById;
        User.findOne = originals.userFindOne;
        bcrypt.hash = originals.hash;
    }
});

test("employee password reset rejects an invalid password before database access", async () => {
    let databaseAccessed = false;
    Employee.findById = () => { databaseAccessed = true; };
    try {
        const res = response();
        await resetEmployeePassword({ params: { id: EMPLOYEE_ID }, body: { newPassword: "short" } }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(databaseAccessed, false);
    } finally {
        Employee.findById = originals.employeeFindById;
    }
});

test("employee password reset returns not found when employee does not exist", async () => {
    Employee.findById = () => ({ select: async () => null });
    try {
        const res = response();
        await resetEmployeePassword({ params: { id: EMPLOYEE_ID }, body: { newPassword: TEST_PASSWORD } }, res);
        assert.equal(res.statusCode, 404);
    } finally {
        Employee.findById = originals.employeeFindById;
    }
});

test("tokenVersion mismatch rejects an old JWT before checking its session", async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    let sessionLookupAttempted = false;
    User.findById = () => ({
        select: async () => ({
            _id: USER_ID,
            employee: EMPLOYEE_ID,
            role: "employee",
            isActive: true,
            tokenVersion: 8
        })
    });
    Session.findOne = () => {
        sessionLookupAttempted = true;
        throw new Error("Old token must be rejected before session lookup");
    };

    try {
        const req = {
            headers: {
                authorization: "Bearer " + jwt.sign({
                    userId: USER_ID,
                    tokenVersion: 7,
                    jti: "pre-reset-session"
                }, TEST_JWT_SECRET)
            }
        };
        const res = response();
        await protect(req, res, () => assert.fail("old token must not reach protected route"));
        assert.equal(res.statusCode, 401);
        assert.match(res.body.message, /Session expired/);
        assert.equal(sessionLookupAttempted, false);
    } finally {
        User.findById = originals.userFindById;
        Session.findOne = originals.sessionFindOne;
    }
});
