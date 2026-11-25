import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Attendance from "../src/models/Attendance.js";
import Employee from "../src/models/Employee.js";
import {
    getMyAttendance,
    getAttendanceRegister,
    getAttendanceTeam
} from "../src/controllers/attendanceController.js";

const EMPLOYEE_ID = "64b000000000000000000101";
const MANAGER_ID = "64b000000000000000000102";
const TEAM_ID = "64b000000000000000000103";
const OUTSIDE_ID = "64b000000000000000000104";

const originals = {
    attendanceFind: Attendance.find,
    attendanceCount: Attendance.countDocuments,
    employeeFind: Employee.find
};

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const makeQuery = (value) => ({
    populate() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
});

test("employee attendance history always uses the authenticated employee ID", async () => {
    let captured;
    Attendance.find = (filter) => {
        captured = filter;
        return makeQuery([]);
    };
    try {
        const res = response();
        await getMyAttendance({
            query: { employeeId: OUTSIDE_ID, from: "2026-01-01", to: "2026-01-31" },
            user: { role: "employee", employeeId: EMPLOYEE_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(captured.employee, EMPLOYEE_ID);
        assert.deepEqual(captured.dateKey, { $gte: "2026-01-01", $lte: "2026-01-31" });
    } finally {
        Attendance.find = originals.attendanceFind;
    }
});

test("employee attendance register is restricted to their own records", async () => {
    let captured;
    Attendance.countDocuments = async (filter) => { captured = filter; return 0; };
    Attendance.find = (filter) => { captured = filter; return makeQuery([]); };
    try {
        const res = response();
        await getAttendanceRegister({
            query: { employeeId: OUTSIDE_ID, date: "2026-02-10" },
            user: { role: "employee", employeeId: EMPLOYEE_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(captured.employee, EMPLOYEE_ID);
        assert.equal(captured.dateKey, "2026-02-10");
    } finally {
        Attendance.countDocuments = originals.attendanceCount;
        Attendance.find = originals.attendanceFind;
    }
});

test("manager attendance register is restricted to their team and own records", async () => {
    let captured;
    Employee.find = () => ({ distinct: async () => [new mongoose.Types.ObjectId(TEAM_ID)] });
    Attendance.countDocuments = async (filter) => { captured = filter; return 0; };
    Attendance.find = (filter) => { captured = filter; return makeQuery([]); };
    try {
        const res = response();
        await getAttendanceRegister({
            query: { from: "2026-02-01", to: "2026-02-28" },
            user: { role: "manager", employeeId: MANAGER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(captured.employee.$in.map(String), [TEAM_ID, MANAGER_ID]);
        assert.deepEqual(captured.dateKey, { $gte: "2026-02-01", $lte: "2026-02-28" });
    } finally {
        Employee.find = originals.employeeFind;
        Attendance.countDocuments = originals.attendanceCount;
        Attendance.find = originals.attendanceFind;
    }
});

test("manager cannot query attendance for an employee outside their team", async () => {
    Employee.find = () => ({ distinct: async () => [new mongoose.Types.ObjectId(TEAM_ID)] });
    let attendanceQueryCalled = false;
    Attendance.countDocuments = async () => { attendanceQueryCalled = true; return 0; };
    try {
        const res = response();
        await getAttendanceRegister({
            query: { employeeId: OUTSIDE_ID },
            user: { role: "manager", employeeId: MANAGER_ID }
        }, res);
        assert.equal(res.statusCode, 403);
        assert.equal(attendanceQueryCalled, false);
    } finally {
        Employee.find = originals.employeeFind;
        Attendance.countDocuments = originals.attendanceCount;
    }
});

test("manager team endpoint returns only active direct reports", async () => {
    let captured;
    Employee.find = (filter) => {
        captured = filter;
        return {
            select() { return this; },
            populate() { return this; },
            sort: async () => []
        };
    };
    try {
        const res = response();
        await getAttendanceTeam({
            user: { role: "manager", employeeId: MANAGER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(captured.reportingManager, MANAGER_ID);
        assert.equal(captured.employmentStatus, "active");
    } finally {
        Employee.find = originals.employeeFind;
    }
});

test("team leader attendance register is restricted to their own records", async () => {
    let captured;
    Attendance.countDocuments = async (filter) => { captured = filter; return 0; };
    Attendance.find = (filter) => { captured = filter; return makeQuery([]); };
    try {
        const res = response();
        await getAttendanceRegister({
            query: { employeeId: OUTSIDE_ID, date: "2026-02-10" },
            user: { role: "team_leader", employeeId: EMPLOYEE_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(captured.employee, EMPLOYEE_ID);
        assert.equal(captured.dateKey, "2026-02-10");
    } finally {
        Attendance.countDocuments = originals.attendanceCount;
        Attendance.find = originals.attendanceFind;
    }
});

test("team leader cannot use the manager team-attendance endpoint", async () => {
    const originalFind = Employee.find;
    let employeeQueryCalled = false;
    Employee.find = () => { employeeQueryCalled = true; throw new Error("Should not query team members"); };
    try {
        const res = response();
        await getAttendanceTeam({ user: { role: "team_leader", employeeId: EMPLOYEE_ID } }, res);
        assert.equal(res.statusCode, 403);
        assert.equal(employeeQueryCalled, false);
    } finally {
        Employee.find = originalFind;
    }
});

test.after(() => {
    Attendance.find = originals.attendanceFind;
    Attendance.countDocuments = originals.attendanceCount;
    Employee.find = originals.employeeFind;
});
