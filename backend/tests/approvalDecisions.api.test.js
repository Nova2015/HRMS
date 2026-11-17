import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";

import leaveRoutes from "../src/routes/leaveRoutes.js";
import expenseRoutes from "../src/routes/expenseRoutes.js";
import employeeUpdateApprovalRoutes from "../src/routes/employeeUpdateApprovalRoutes.js";
import User from "../src/models/User.js";
import Employee from "../src/models/Employee.js";
import LeaveRequest from "../src/models/LeaveRequest.js";
import ExpenseClaim from "../src/models/ExpenseClaim.js";
import EmployeeUpdateApproval from "../src/models/EmployeeUpdateApproval.js";
import AuditLog from "../src/models/AuditLog.js";

const SECRET = "approval-decision-api-test-secret-at-least-32-characters";
const IDS = {
    adminUser: "64b000000000000000000011",
    hrUser: "64b000000000000000000012",
    managerUser: "64b000000000000000000013",
    employeeUser: "64b000000000000000000014",
    managerEmployee: "64b000000000000000000015",
    teamEmployee: "64b000000000000000000016",
    otherEmployee: "64b000000000000000000017",
    record: "64b000000000000000000018"
};
const rolesByUser = new Map([
    [IDS.adminUser, "admin"],
    [IDS.hrUser, "hr"],
    [IDS.managerUser, "manager"],
    [IDS.employeeUser, "employee"]
]);

process.env.JWT_SECRET = SECRET;

const originals = [];
const calls = { leaveFilters: [], expenseFilters: [], updateFilters: [], teamFilters: [] };
let server;
let baseUrl;

const tokenFor = (role) => {
    const userId = [...rolesByUser].find(([, value]) => value === role)?.[0];
    return jwt.sign({ userId, tokenVersion: 0 }, SECRET, { algorithm: "HS256" });
};

const send = (role, method, path, body = {}) => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
        authorization: `Bearer ${tokenFor(role)}`,
        "content-type": "application/json"
    },
    body: JSON.stringify(body)
});

const populatedQuery = (value) => ({
    populate() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
});

const remember = (model, method) => {
    originals.push({ model, method, original: model[method] });
};

before(async () => {
    for (const [model, methods] of [
        [User, ["findById"]],
        [Employee, ["findById", "find"]],
        [LeaveRequest, ["findOneAndUpdate", "exists", "findById"]],
        [ExpenseClaim, ["findOneAndUpdate", "exists", "findById"]],
        [EmployeeUpdateApproval, ["findOne", "findOneAndUpdate"]],
        [AuditLog, ["create"]]
    ]) {
        for (const method of methods) remember(model, method);
    }

    User.findById = (userId) => ({
        select: async () => ({
            _id: userId,
            employee: IDS.managerEmployee,
            role: rolesByUser.get(userId),
            isActive: true,
            tokenVersion: 0
        })
    });
    Employee.findById = () => ({
        select: async () => ({ _id: IDS.managerEmployee, employmentStatus: "active" })
    });
    Employee.find = (filter) => {
        calls.teamFilters.push(filter);
        return { distinct: async () => [IDS.teamEmployee] };
    };

    LeaveRequest.findOneAndUpdate = async (filter, update) => {
        calls.leaveFilters.push({ filter, update });
        if (filter.employee && !filter.employee.$in.includes(IDS.teamEmployee)) return null;
        return { _id: IDS.record };
    };
    LeaveRequest.exists = async () => false;
    LeaveRequest.findById = () => populatedQuery({ _id: IDS.record, status: "approved" });

    ExpenseClaim.findOneAndUpdate = async (filter, update) => {
        calls.expenseFilters.push({ filter, update });
        return { _id: IDS.record };
    };
    ExpenseClaim.exists = async () => false;
    ExpenseClaim.findById = () => populatedQuery({ _id: IDS.record, status: "approved" });

    EmployeeUpdateApproval.findOne = async (filter) => {
        assert.deepEqual(filter, { _id: IDS.record, status: "pending" });
        return { _id: IDS.record, status: "pending" };
    };
    EmployeeUpdateApproval.findOneAndUpdate = async (filter, update) => {
        calls.updateFilters.push({ filter, update });
        return { _id: IDS.record, status: "rejected" };
    };
    AuditLog.create = async () => ({});

    const app = express();
    app.use(express.json());
    app.use("/api/leaves", leaveRoutes);
    app.use("/api/expenses", expenseRoutes);
    app.use("/api/employee-update-approvals", employeeUpdateApprovalRoutes);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
    for (const { model, method, original } of originals.reverse()) model[method] = original;
});

test("Leave decision API allows Admin and HR to approve pending requests", async () => {
    for (const role of ["admin", "hr"]) {
        const response = await send(role, "PATCH", `/api/leaves/${IDS.record}/review`, {
            decision: "approved",
            reviewComment: "Reviewed"
        });
        assert.equal(response.status, 200, role);
    }
});

test("Leave decision API allows a Manager to review an assigned team member", async () => {
    calls.leaveFilters.length = 0;
    calls.teamFilters.length = 0;
    const response = await send("manager", "PATCH", `/api/leaves/${IDS.record}/review`, {
        decision: "rejected",
        reviewComment: "Not approved"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.teamFilters.at(-1), { reportingManager: IDS.managerEmployee });
    assert.deepEqual(calls.leaveFilters.at(-1).filter.employee, { $in: [IDS.teamEmployee] });
});

test("Leave decision API does not let a Manager review a request outside their assigned team", async () => {
    let capturedFilter;
    LeaveRequest.findOneAndUpdate = async (filter) => {
        capturedFilter = filter;
        return null;
    };
    LeaveRequest.exists = async () => false;
    const response = await send("manager", "PATCH", `/api/leaves/${IDS.record}/review`, {
        decision: "approved"
    });
    assert.equal(response.status, 404);
    assert.deepEqual(capturedFilter.employee, { $in: [IDS.teamEmployee] });
});

test("Employee cannot access the Leave decision endpoint", async () => {
    const response = await send("employee", "PATCH", `/api/leaves/${IDS.record}/review`, {
        decision: "approved"
    });
    assert.equal(response.status, 403);
});

test("Expense decision API allows Admin and HR", async () => {
    for (const role of ["admin", "hr"]) {
        const response = await send(role, "PATCH", `/api/expenses/claims/${IDS.record}/review`, {
            decision: "approved",
            reviewComment: "Receipt verified"
        });
        assert.equal(response.status, 200, role);
    }
});

test("Manager and Employee cannot access the Expense decision endpoint", async () => {
    for (const role of ["manager", "employee"]) {
        const response = await send(role, "PATCH", `/api/expenses/claims/${IDS.record}/review`, {
            decision: "approved"
        });
        assert.equal(response.status, 403, role);
    }
});

test("Employee Update decision API allows Admin and HR to reject a pending proposal", async () => {
    for (const role of ["admin", "hr"]) {
        const response = await send(role, "PATCH", `/api/employee-update-approvals/${IDS.record}/decision`, {
            decision: "reject",
            note: "Details do not match"
        });
        assert.equal(response.status, 200, role);
    }
});

test("Manager and Employee cannot access the Employee Update decision endpoint", async () => {
    for (const role of ["manager", "employee"]) {
        const response = await send(role, "PATCH", `/api/employee-update-approvals/${IDS.record}/decision`, {
            decision: "reject"
        });
        assert.equal(response.status, 403, role);
    }
});

test("Decision APIs reject unsupported decision values", async () => {
    const leave = await send("admin", "PATCH", `/api/leaves/${IDS.record}/review`, { decision: "pending" });
    const expense = await send("hr", "PATCH", `/api/expenses/claims/${IDS.record}/review`, { decision: "pending" });
    const update = await send("admin", "PATCH", `/api/employee-update-approvals/${IDS.record}/decision`, { decision: "pending" });
    assert.equal(leave.status, 400);
    assert.equal(expense.status, 400);
    assert.equal(update.status, 400);
});

test("All decision APIs require a non-empty reason when rejecting", async () => {
    const cases = [
        ["admin", `/api/leaves/${IDS.record}/review`, { decision: "rejected", reviewComment: "   " }],
        ["hr", `/api/expenses/claims/${IDS.record}/review`, { decision: "rejected", reviewComment: "" }],
        ["admin", `/api/employee-update-approvals/${IDS.record}/decision`, { decision: "reject", note: "   " }]
    ];

    for (const [role, path, body] of cases) {
        const response = await send(role, "PATCH", path, body);
        assert.equal(response.status, 400, path);
        const result = await response.json();
        assert.match(result.message, /reason is required/i);
    }
});

test("Decision APIs still allow approvals without an optional note", async () => {
    const leave = await send("admin", "PATCH", `/api/leaves/${IDS.record}/review`, { decision: "approved" });
    const expense = await send("hr", "PATCH", `/api/expenses/claims/${IDS.record}/review`, { decision: "approved" });
    const update = await send("admin", "PATCH", `/api/employee-update-approvals/${IDS.record}/decision`, { decision: "approve" });

    assert.equal(leave.status, 200);
    assert.equal(expense.status, 200);
    assert.equal(update.status, 200);
});
