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
    adminUser: "64b000000000000000000005",
    hrUser: "64b000000000000000000007",
    managerUser: "64b000000000000000000008",
    employeeUser: "64b000000000000000000009",
    employee: "64b000000000000000000006",
    teamMember: "64b000000000000000000003"
};
const ROLES_BY_USER_ID = new Map([
    [IDS.adminUser, "admin"],
    [IDS.hrUser, "hr"],
    [IDS.managerUser, "manager"],
    [IDS.employeeUser, "employee"]
]);

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

const queryResult = () => ({
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => []
});

const tokenFor = (role) => {
    const userId = [...ROLES_BY_USER_ID].find(([, value]) => value === role)?.[0];
    return jwt.sign({ userId, tokenVersion: 0 }, SECRET, { algorithm: "HS256" });
};

const get = (role) => fetch(`${baseUrl}/api/approvals`, {
    headers: { authorization: `Bearer ${tokenFor(role)}` }
});

before(async () => {
    for (const [model, methods] of [
        [User, ["findById"]],
        [Employee, ["findById", "find"]],
        [LeaveRequest, ["find"]],
        [ExpenseClaim, ["find"]],
        [EmployeeUpdateApproval, ["find"]]
    ]) {
        originals[model.modelName] = {};
        for (const method of methods) originals[model.modelName][method] = model[method];
    }

    User.findById = (userId) => ({
        select: async () => ({
            _id: userId,
            employee: IDS.employee,
            role: ROLES_BY_USER_ID.get(userId),
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
        return queryResult();
    };
    ExpenseClaim.find = (filter) => {
        calls.expenseFilters.push(filter);
        return queryResult();
    };
    EmployeeUpdateApproval.find = (filter) => {
        calls.updateFilters.push(filter);
        return queryResult();
    };

    const app = express();
    app.use("/api/approvals", approvalRoutes);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

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
        for (const method of methods) model[method] = originals[model.modelName][method];
    }
});

test("Approval Inbox API returns 401 without a bearer token", async () => {
    const response = await fetch(`${baseUrl}/api/approvals`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).success, false);
});

test("Approval Inbox API rejects an authenticated employee with 403", async () => {
    const response = await get("employee");
    assert.equal(response.status, 403);
    assert.equal((await response.json()).success, false);
});

for (const role of ["admin", "hr"]) {
    test(`Approval Inbox API loads all three approval types for ${role}`, async () => {
        calls.leaveFilters.length = 0;
        calls.expenseFilters.length = 0;
        calls.updateFilters.length = 0;

        const response = await get(role);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).success, true);
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

    const response = await get("manager");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.deepEqual(calls.employeeTeamFilters.at(-1), { reportingManager: IDS.employee });
    assert.deepEqual(calls.leaveFilters.at(-1), {
        status: "pending",
        employee: { $in: [IDS.teamMember] }
    });
    assert.equal(calls.expenseFilters.length, 0);
    assert.equal(calls.updateFilters.length, 0);
});
