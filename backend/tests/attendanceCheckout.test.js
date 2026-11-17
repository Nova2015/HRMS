import test from "node:test";
import assert from "node:assert/strict";
import Attendance from "../src/models/Attendance.js";
import Employee from "../src/models/Employee.js";
import { checkOut } from "../src/controllers/attendanceController.js";

const EMPLOYEE_ID = "64b000000000000000000101";
const ATTENDANCE_ID = "64b000000000000000000201";

const originals = {
    findOne: Attendance.findOne,
    findOneAndUpdate: Attendance.findOneAndUpdate,
    findById: Employee.findById
};

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const installOpenAttendance = () => {
    Attendance.findOne = () => ({
        sort() {
            return Promise.resolve({
                _id: ATTENDANCE_ID,
                employee: EMPLOYEE_ID,
                checkIn: new Date(Date.now() - 60 * 60 * 1000),
                checkOut: null,
                source: "self"
            });
        }
    });
    Employee.findById = () => ({
        select: async () => ({ shift: null })
    });
};

test("check-out compare-and-set excludes records already corrected manually", async () => {
    let capturedFilter;
    installOpenAttendance();
    Attendance.findOneAndUpdate = async (filter) => {
        capturedFilter = filter;
        // A manual correction won the race after the open record was read.
        return null;
    };

    try {
        const res = response();
        await checkOut({ user: { employeeId: EMPLOYEE_ID } }, res);

        assert.equal(capturedFilter._id, ATTENDANCE_ID);
        assert.equal(capturedFilter.employee, EMPLOYEE_ID);
        assert.equal(capturedFilter.checkOut, null);
        assert.deepEqual(capturedFilter.source, { $ne: "manual" });
        assert.equal(res.statusCode, 409);
        assert.equal(res.body.success, false);
    } finally {
        Attendance.findOne = originals.findOne;
        Attendance.findOneAndUpdate = originals.findOneAndUpdate;
        Employee.findById = originals.findById;
    }
});

test("check-out can still update a self-service attendance record", async () => {
    let capturedFilter;
    installOpenAttendance();
    Attendance.findOneAndUpdate = async (filter, update) => {
        capturedFilter = filter;
        assert.ok(update.$set.checkOut instanceof Date);
        assert.equal(typeof update.$set.workMinutes, "number");
        return { _id: ATTENDANCE_ID, source: "self", ...update.$set };
    };

    try {
        const res = response();
        await checkOut({ user: { employeeId: EMPLOYEE_ID } }, res);

        assert.deepEqual(capturedFilter.source, { $ne: "manual" });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
    } finally {
        Attendance.findOne = originals.findOne;
        Attendance.findOneAndUpdate = originals.findOneAndUpdate;
        Employee.findById = originals.findById;
    }
});

test.after(() => {
    Attendance.findOne = originals.findOne;
    Attendance.findOneAndUpdate = originals.findOneAndUpdate;
    Employee.findById = originals.findById;
});
