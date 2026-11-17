import test from "node:test";
import assert from "node:assert/strict";
import Payroll from "../src/models/Payroll.js";
import { listPayroll, getPayslip } from "../src/controllers/payrollController.js";

const OWNER_ID = "64b000000000000000000071";
const OTHER_ID = "64b000000000000000000072";
const PAYROLL_ID = "64b000000000000000000073";
const originalFind = Payroll.find;
const originalFindById = Payroll.findById;

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const makePayslipQuery = (employeeId = OWNER_ID) => ({
    populate: async () => ({
        _id: PAYROLL_ID,
        employee: { _id: { toString: () => employeeId }, employeeCode: "EMP-001" },
        netPay: 50000
    })
});

test("employee payroll list is scoped to their own employee record", async () => {
    let capturedFilter;
    Payroll.find = (filter) => {
        capturedFilter = filter;
        return {
            populate() { return this; },
            sort: async () => []
        };
    };
    try {
        const res = response();
        await listPayroll({ query: { period: "2026-11" }, user: { role: "employee", employeeId: OWNER_ID } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(capturedFilter.period, "2026-11");
        assert.equal(capturedFilter.employee, OWNER_ID);
    } finally {
        Payroll.find = originalFind;
    }
});

test("employee cannot read another employee's payslip", async () => {
    Payroll.findById = () => makePayslipQuery(OWNER_ID);
    try {
        const res = response();
        await getPayslip({ params: { id: PAYROLL_ID }, user: { role: "employee", employeeId: OTHER_ID } }, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.success, false);
    } finally {
        Payroll.findById = originalFindById;
    }
});

test("employee can read their own payslip", async () => {
    Payroll.findById = () => makePayslipQuery(OWNER_ID);
    try {
        const res = response();
        await getPayslip({ params: { id: PAYROLL_ID }, user: { role: "employee", employeeId: OWNER_ID } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.netPay, 50000);
    } finally {
        Payroll.findById = originalFindById;
    }
});

test("HR can read an employee payslip", async () => {
    Payroll.findById = () => makePayslipQuery(OWNER_ID);
    try {
        const res = response();
        await getPayslip({ params: { id: PAYROLL_ID }, user: { role: "hr", employeeId: OTHER_ID } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.netPay, 50000);
    } finally {
        Payroll.findById = originalFindById;
    }
});
