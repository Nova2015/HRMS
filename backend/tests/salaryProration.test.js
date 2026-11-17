import test from "node:test";
import assert from "node:assert/strict";
import { calculateAutomaticProration, calculateManualProration } from "../src/utils/salaryProration.js";

test("automatic proration splits working and paid days by calendar-day share", () => {
    const result = calculateAutomaticProration(22, 20, 30, [15, 15]);
    assert.deepEqual(result.workingDays, [11, 11]);
    assert.deepEqual(result.paidDays, [10, 10]);
});

test("automatic proration supports unequal revision periods and preserves totals", () => {
    const result = calculateAutomaticProration(26, 24, 31, [10, 21]);
    assert.ok(Math.abs(result.workingDays.reduce((a, b) => a + b, 0) - 26) < 1e-9);
    assert.ok(Math.abs(result.paidDays.reduce((a, b) => a + b, 0) - 24) < 1e-9);
    assert.ok(result.workingDays[1] > result.workingDays[0]);
});

test("manual proration accepts exact old/new day totals", () => {
    assert.deepEqual(
        calculateManualProration(26, 24, 12, 14, 11, 13),
        { workingDays: [12, 14], paidDays: [11, 13] }
    );
});

test("manual proration rejects totals that do not match monthly totals", () => {
    assert.throws(() => calculateManualProration(26, 24, 12, 13, 11, 13), /do not match/);
    assert.throws(() => calculateManualProration(26, 24, 12, 14, 12, 13), /do not match/);
});

test("automatic proration rejects invalid paid days", () => {
    assert.throws(() => calculateAutomaticProration(20, 21, 30, [10, 20]), /Invalid automatic/);
});
