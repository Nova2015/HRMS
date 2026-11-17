import test from "node:test";
import assert from "node:assert/strict";
import { isValidPayrollProrationMode } from "../src/controllers/payrollController.js";

test("payroll proration accepts supported modes and omitted mode defaults to automatic", () => {
    assert.equal(isValidPayrollProrationMode("auto"), true);
    assert.equal(isValidPayrollProrationMode("manual"), true);
    assert.equal(isValidPayrollProrationMode(undefined), true);
    assert.equal(isValidPayrollProrationMode(null), true);
    assert.equal(isValidPayrollProrationMode(""), true);
});

test("payroll proration rejects unsupported or misspelled modes", () => {
    assert.equal(isValidPayrollProrationMode("automatic"), false);
    assert.equal(isValidPayrollProrationMode("AUTO"), false);
    assert.equal(isValidPayrollProrationMode("manul"), false);
    assert.equal(isValidPayrollProrationMode("none"), false);
    assert.equal(isValidPayrollProrationMode(1), false);
});
