import test from "node:test";
import assert from "node:assert/strict";
import Attendance from "../src/models/Attendance.js";
import Employee from "../src/models/Employee.js";
import Shift from "../src/models/Shift.js";
import { saveManualAttendance } from "../src/controllers/attendanceController.js";

const EMPLOYEE_ID = "64b000000000000000000101";
const SHIFT_ID = "64b000000000000000000301";
const USER_ID = "64b000000000000000000401";

const originals = {
    findOneAndUpdate: Attendance.findOneAndUpdate,
    employeeFindById: Employee.findById,
    shiftFindById: Shift.findById
};

const runManualAttendance = async (checkIn) => {
    let savedUpdate;
    Employee.findById = async () => ({ shift: SHIFT_ID });
    Shift.findById = () => ({
        select: async () => ({
            startTime: "22:00",
            endTime: "06:00",
            gracePeriodMinutes: 15
        })
    });
    // Capture the update passed to the persistence layer.
    Attendance.findOneAndUpdate = (filter, update) => {
        savedUpdate = update.$set;
        return { populate: async () => ({ ...update.$set }) };
    };

    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };

    try {
        await saveManualAttendance({
            body: {
                employeeId: EMPLOYEE_ID,
                dateKey: "2026-11-17",
                status: "present",
                checkIn,
                checkOut: null,
                notes: ""
            },
            user: { userId: USER_ID }
        }, res);
        return { res, savedUpdate };
    } finally {
        Attendance.findOneAndUpdate = originals.findOneAndUpdate;
        Employee.findById = originals.employeeFindById;
        Shift.findById = originals.shiftFindById;
    }
};

test("manual overnight check-in within grace period after midnight is not late", async () => {
    // 02:00 Asia/Kolkata on Nov 18 belongs to the Nov 17 overnight shift.
    const { res, savedUpdate } = await runManualAttendance("2026-11-17T20:30:00.000Z");
    assert.equal(res.statusCode, 200);
    assert.equal(savedUpdate.isLate, false);
});

test("manual overnight check-in after midnight remains within the shift window", async () => {
    // 02:16 Asia/Kolkata on Nov 18 is still inside the 22:00-06:00 shift window.
    const { res, savedUpdate } = await runManualAttendance("2026-11-17T20:46:00.000Z");
    assert.equal(res.statusCode, 200);
    assert.equal(savedUpdate.isLate, false);
});

test("manual overnight check-in after the grace period at shift start is late", async () => {
    // 22:16 Asia/Kolkata on Nov 17 is after the 22:15 grace threshold.
    const { res, savedUpdate } = await runManualAttendance("2026-11-17T16:46:00.000Z");
    assert.equal(res.statusCode, 200);
    assert.equal(savedUpdate.isLate, true);
});

test.after(() => {
    Attendance.findOneAndUpdate = originals.findOneAndUpdate;
    Employee.findById = originals.employeeFindById;
    Shift.findById = originals.shiftFindById;
});
