import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";

import approvalRoutes from "../src/routes/approvalRoutes.js";
import User from "../src/models/User.js";
import Employee from "../src/models/Employee.js";
import LeaveRequest from "../src/models/LeaveRequest.js";
import ExpenseClaim from "../src/models/ExpenseClaim.js";
import EmployeeUpdateApproval from "../src/models/EmployeeUpdateApproval.js";

const SECRET = "approval-api-integration-test-secret-at-least-32-characters";
const IDS = {
    user: "64b000000000000000000005",
    employee: "64b000000000000000000006",
    manager: "64b000000000000000000002",
    teamMember: "64b000000000000000000003"
};

process.env.JWT_SECRET = SECRET;

const originals = {};
const calls = {
    leaveFilters: [],
    expenseFilters: [],
    updateFilters: [],
    employeeTeamFilters: []
};

let server;
let baseUrl;

const queryResult = (value = []) => ({
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => value
});

const tokenFor = (role) => jwt.sign({
    userId: IDS.user,
    tokenVersion: 0,
    role
}, SECRET, { algorithm: "HS256" });

const request = async (role, token = true) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${tokenFor(role)}`;
    return fetch(`${baseUrl}/api/approvals`, { headers });
};

before(async () => {
    for (const [model, methods] of [
        [User, ["findById"]],
        [Employee, ["findById", "find"]],
        [LeaveRequest, ["find"]],
        [ExpenseClaim, ["find"]],
        [EmployeeUpdateApproval, ["find"]]
    ]) {
        originals[model.modelName] = {};
        for (const method of methods) {
            originals[model.modelName][method] = model[method];
        }
    }

    User.findById = () => ({
        select: async () => ({
            _id: IDS.user,
            employee: IDS.employee,
            role: currentRole,
            isActive: true,
            tokenVersion: 0
        })
    });

    Employee.findById = () => ({
        select: async () => ({ _id: IDS.employee, employmentStatus: "active" })
    });

    Employee.find = (filter) => {
        calls.employeeTeamFilters.push(filter);
        return { distinct: async () => [IDS.teamMember] };
    };

    LeaveRequest.find = (filter) => {
        calls.leaveFilters.push(filter);
        return queryResult([]);
    };
    ExpenseClaim.find = (filter) => {
        calls.expenseFilters.push(filter);
        return queryResult([]);
    };
    EmployeeUpdateApproval.find = (filter) => {
        calls.updateFilters.push(filter);
        return queryResult([]);
    };

    const app = express();
    app.use("/api/approvals", (req, res, next) => {
        currentRole = req.headers["x-test-role"] || "admin";
        next();
    }, approvalRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

let currentRole = "admin";

after(async () => {
    if (server) await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });

    for (const [model, methods] of [
        [User, ["findById"]],
        [Employee, ["findById", "find"]],
        [LeaveRequest, ["find"]],
        [ExpenseClaim, ["find"]],
        [EmployeeUpdateApproval, ["find"]]
    ]) {
        for (const method of methods) {
            model[method] = originals[model.modelName][method];
        }
    }
});

test("Approval Inbox API returns 401 without a bearer token", async () => {
    const response = await fetch(`${baseUrl}/api/approvals`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.success, false);
});

test("Approval Inbox API rejects an authenticated employee with 403", async () => {
    const response = await fetch(`${baseUrl}/api/approvals`, {
        headers: {
            authorization: `Bearer ${tokenFor("employee")}`,
            "x-test-role": "employee"
        }
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.success, false);
});

for (const role of ["admin", "hr"]) {
    test(`Approval Inbox API loads all three approval types for ${role}`, async () => {
        calls.leaveFilters.length = 0;
        calls.expenseFilters.length = 0;
        calls.updateFilters.length = 0;

        const response = await fetch(`${baseUrl}/api/approvals`, {
            headers: {
                authorization: `Bearer ${tokenFor(role)}`,
                "x-test-role": role
            }
        });

        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.success, true);
        assert.deepEqual(calls.leaveFilters.at(-1), { status: "pending" });
        assert.deepEqual(calls.expenseFilters.at(-1), { status: "pending" });
        assert.deepEqual(calls.updateFilters.at(-1), { status: "pending" });
    });
}

test("Approval Inbox API limits a manager to assigned-team leave and omits other approval types", async () => {
    calls.leaveFilters.length = 0;
    calls.expenseFilters.length = 0;
    calls.updateFilters.length = 0;
    calls.employeeTeamFilters.length = 0;

    const response = await fetch(`${baseUrl}/api/approvals`, {
        headers: {
            authorization: `Bearer ${tokenFor("manager")}`,
            "x-test-role": "manager"
        }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.deepEqual(calls.employeeTeamFilters.at(-1), { reportingManager: IDS.employee });
    assert.deepEqual(calls.leaveFilters.at(-1), {
        status: "pending",
        employee: { $in: [IDS.teamMember] }
    });
    assert.equal(calls.expenseFilters.length, 0);
    assert.equal(calls.updateFilters.length, 0);
});
