import test from "node:test";
import assert from "node:assert/strict";
import Employee from "../src/models/Employee.js";
import LeaveRequest from "../src/models/LeaveRequest.js";
import { getLeaveRequests } from "../src/controllers/leaveController.js";

const EMPLOYEE_ID = "64b000000000000000000091";
const MANAGER_ID = "64b000000000000000000092";
const TEAM_ID = "64b000000000000000000093";
const OUTSIDE_ID = "64b000000000000000000094";
const originalEmployeeFind = Employee.find;
const originalLeaveFind = LeaveRequest.find;

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const mockLeaveFind = (capture) => {
    LeaveRequest.find = (filter) => {
        capture(filter);
        return {
            populate() { return this; },
            sort() { return this; },
            limit() { return this; },
            then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); }
        };
    };
};

test("employee leave register is restricted to own requests and ignores status filtering", async () => {
    let captured;
    mockLeaveFind((filter) => { captured = filter; });
    try {
        const res = response();
        await getLeaveRequests({
            query: { status: "approved", employeeId: OUTSIDE_ID },
            user: { role: "employee", employeeId: EMPLOYEE_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(captured.employee, EMPLOYEE_ID);
        assert.equal("status" in captured, false);
    } finally {
        LeaveRequest.find = originalLeaveFind;
    }
});

test("manager leave register is restricted to their direct reports and own requests", async () => {
    let captured;
    Employee.find = () => ({ distinct: async () => [TEAM_ID] });
    mockLeaveFind((filter) => { captured = filter; });
    try {
        const res = response();
        await getLeaveRequests({
            query: { status: "pending" },
            user: { role: "manager", employeeId: MANAGER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(captured.employee.$in.map(String), [TEAM_ID, MANAGER_ID]);
        assert.equal(captured.status, "pending");
    } finally {
        Employee.find = originalEmployeeFind;
        LeaveRequest.find = originalLeaveFind;
    }
});

test("manager cannot filter leave register to an employee outside their team", async () => {
    Employee.find = () => ({ distinct: async () => [TEAM_ID] });
    let leaveQueryCalled = false;
    LeaveRequest.find = () => { leaveQueryCalled = true; throw new Error("Should not query"); };
    try {
        const res = response();
        await getLeaveRequests({
            query: { employeeId: OUTSIDE_ID },
            user: { role: "manager", employeeId: MANAGER_ID }
        }, res);
        assert.equal(res.statusCode, 403);
        assert.equal(leaveQueryCalled, false);
    } finally {
        Employee.find = originalEmployeeFind;
        LeaveRequest.find = originalLeaveFind;
    }
});

test("team leader leave register is restricted to own requests", async () => {
    let captured;
    mockLeaveFind((filter) => { captured = filter; });
    try {
        const res = response();
        await getLeaveRequests({
            query: { status: "approved", employeeId: OUTSIDE_ID },
            user: { role: "team_leader", employeeId: EMPLOYEE_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(captured.employee, EMPLOYEE_ID);
        assert.equal("status" in captured, false);
    } finally {
        LeaveRequest.find = originalLeaveFind;
    }
});

test.after(() => {
    Employee.find = originalEmployeeFind;
    LeaveRequest.find = originalLeaveFind;
});
