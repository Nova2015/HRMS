import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ExpenseClaim from "../src/models/ExpenseClaim.js";
import { downloadExpenseReceipt } from "../src/controllers/expenseController.js";

const CLAIM_ID = "64b000000000000000000061";
const OWNER_ID = "64b000000000000000000062";
const OTHER_ID = "64b000000000000000000063";
const originals = { findById: ExpenseClaim.findById, access: fs.access };

const makeResponse = () => ({
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    download(filePath, fileName) { this.downloaded = { filePath, fileName }; return this; }
});

const stubClaim = () => {
    ExpenseClaim.findById = () => ({
        select: async () => ({
            employee: { toString: () => OWNER_ID },
            receiptOriginalName: "expense-receipt.pdf",
            receiptStoredName: "random-receipt-file.pdf",
            receiptMimeType: "application/pdf"
        })
    });
};

test("employee cannot download another employee's expense receipt", async () => {
    let fileAccessAttempted = false;
    stubClaim();
    fs.access = async () => { fileAccessAttempted = true; };
    try {
        const res = makeResponse();
        await downloadExpenseReceipt({
            params: { id: CLAIM_ID },
            user: { role: "employee", employeeId: OTHER_ID }
        }, res);
        assert.equal(res.statusCode, 403);
        assert.match(res.body.message, /do not have permission/);
        assert.equal(fileAccessAttempted, false);
        assert.equal(res.downloaded, undefined);
    } finally {
        ExpenseClaim.findById = originals.findById;
        fs.access = originals.access;
    }
});

test("employee can download their own expense receipt", async () => {
    stubClaim();
    fs.access = async () => {};
    try {
        const res = makeResponse();
        await downloadExpenseReceipt({
            params: { id: CLAIM_ID },
            user: { role: "employee", employeeId: OWNER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
        assert.equal(res.headers["Content-Type"], "application/pdf");
        assert.equal(res.downloaded.fileName, "expense-receipt.pdf");
        assert.ok(res.downloaded.filePath.endsWith("random-receipt-file.pdf"));
    } finally {
        ExpenseClaim.findById = originals.findById;
        fs.access = originals.access;
    }
});

test("HR can download an employee expense receipt", async () => {
    stubClaim();
    fs.access = async () => {};
    try {
        const res = makeResponse();
        await downloadExpenseReceipt({
            params: { id: CLAIM_ID },
            user: { role: "hr", employeeId: OTHER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.downloaded.fileName, "expense-receipt.pdf");
    } finally {
        ExpenseClaim.findById = originals.findById;
        fs.access = originals.access;
    }
});
