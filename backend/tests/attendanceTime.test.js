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
    assert.equal(isLateCheckIn(new Date("2026-11-17T04:00:00.000Z"), null, 555), false);
    assert.equal(isLateCheckIn(new Date("2026-11-17T04:01:00.000Z"), null, 555), true);
});
