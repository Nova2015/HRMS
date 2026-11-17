import test from "node:test";
import assert from "node:assert/strict";
import { getAttendanceDateKey, isLateCheckIn } from "../src/utils/attendanceTime.js";

const nightShift = { startTime: "22:00", endTime: "06:00", gracePeriodMinutes: 15 };

test("overnight shift check-in before midnight belongs to the current date", () => {
    assert.equal(getAttendanceDateKey(new Date("2026-11-17T16:45:00.000Z"), nightShift), "2026-11-17");
});

test("overnight shift check-in after midnight belongs to the previous shift date", () => {
    assert.equal(getAttendanceDateKey(new Date("2026-11-17T20:30:00.000Z"), nightShift), "2026-11-17");
});

test("overnight shift check-in within the after-midnight shift window is not incorrectly late", () => {
    assert.equal(isLateCheckIn(new Date("2026-11-17T20:30:00.000Z"), nightShift, 555), false);
});

test("overnight shift check-in after the grace period is late", () => {
    assert.equal(isLateCheckIn(new Date("2026-11-17T16:50:00.000Z"), nightShift, 555), true);
});

test("day shift check-in uses its configured grace period", () => {
    const dayShift = { startTime: "09:00", endTime: "18:00", gracePeriodMinutes: 15 };
    assert.equal(isLateCheckIn(new Date("2026-11-17T03:20:00.000Z"), dayShift, 555), false);
    assert.equal(isLateCheckIn(new Date("2026-11-17T03:46:00.000Z"), dayShift, 555), true);
});

test("default schedule uses the default late threshold", () => {
    // 03:45 UTC is 09:15 in Asia/Kolkata (the exact threshold); 03:46 is one minute late.
    assert.equal(isLateCheckIn(new Date("2026-11-17T03:45:00.000Z"), null, 555), false);
    assert.equal(isLateCheckIn(new Date("2026-11-17T03:46:00.000Z"), null, 555), true);
});


test("attendance shift snapshot preserves the original schedule after reassignment", async () => {
    const { getShiftSnapshot, getShiftFromSnapshot } = await import("../src/utils/attendanceTime.js");
    const originalShift = { startTime: "09:00", endTime: "18:00", gracePeriodMinutes: 15 };
    const snapshot = getShiftSnapshot(originalShift);
    const changedShift = { startTime: "10:00", endTime: "19:00", gracePeriodMinutes: 30 };
    assert.deepEqual(getShiftFromSnapshot(snapshot, changedShift), originalShift);
});

test("legacy attendance without a shift snapshot falls back to the employee current shift", async () => {
    const { getShiftFromSnapshot } = await import("../src/utils/attendanceTime.js");
    const currentShift = { startTime: "10:00", endTime: "19:00", gracePeriodMinutes: 30 };
    assert.equal(getShiftFromSnapshot({}, currentShift), currentShift);
});

test("attendance without an assigned shift stores no shift snapshot", async () => {
    const { getShiftSnapshot } = await import("../src/utils/attendanceTime.js");
    assert.deepEqual(getShiftSnapshot(null), {
        shiftStartTime: null,
        shiftEndTime: null,
        shiftGracePeriodMinutes: null
    });
});
