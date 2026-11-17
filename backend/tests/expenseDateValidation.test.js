import test from "node:test";
import assert from "node:assert/strict";
import { parseExpenseDateOnly } from "../src/controllers/expenseController.js";

test("accepts valid date-only expense dates", () => {
    const date = parseExpenseDateOnly("2024-02-29");
    assert.ok(date instanceof Date);
    assert.equal(date.toISOString(), "2024-02-29T00:00:00.000Z");
});

test("rejects impossible calendar dates instead of normalizing them", () => {
    for (const value of ["2025-02-29", "2026-02-31", "2026-04-31", "2026-13-01", "2026-00-10"]) {
        assert.equal(parseExpenseDateOnly(value), null, value);
    }
});

test("rejects timestamps, locale dates, and non-string values", () => {
    for (const value of ["2026-11-17T00:00:00.000Z", "17/11/2026", "", null, undefined, 20261117]) {
        assert.equal(parseExpenseDateOnly(value), null);
    }
});

test("accepts valid first and last days of a month", () => {
    assert.equal(parseExpenseDateOnly("2026-01-01").toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(parseExpenseDateOnly("2026-12-31").toISOString(), "2026-12-31T00:00:00.000Z");
});
