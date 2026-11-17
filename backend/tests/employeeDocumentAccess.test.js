import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import EmployeeDocument from "../src/models/EmployeeDocument.js";
import { downloadEmployeeDocument } from "../src/controllers/employeeDocumentController.js";

const DOCUMENT_ID = "64b000000000000000000051";
const OWNER_ID = "64b000000000000000000052";
const OTHER_ID = "64b000000000000000000053";
const originals = {
    findById: EmployeeDocument.findById,
    access: fs.access
};

const makeResponse = () => ({
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    download(filePath, fileName) {
        this.downloaded = { filePath, fileName };
        return this;
    }
});

const stubDocument = () => {
    EmployeeDocument.findById = () => ({
        select: async () => ({
            employee: { toString: () => OWNER_ID },
            originalName: "private-record.pdf",
            storedName: "random-storage-name.pdf",
            mimeType: "application/pdf"
        })
    });
};

test("employee cannot download another employee's document", async () => {
    let fileAccessAttempted = false;
    stubDocument();
    fs.access = async () => { fileAccessAttempted = true; };

    try {
        const res = makeResponse();
        await downloadEmployeeDocument({
            params: { id: DOCUMENT_ID },
            user: { role: "employee", employeeId: OTHER_ID }
        }, res);
        assert.equal(res.statusCode, 403);
        assert.match(res.body.message, /do not have permission/);
        assert.equal(fileAccessAttempted, false);
        assert.equal(res.downloaded, undefined);
    } finally {
        EmployeeDocument.findById = originals.findById;
        fs.access = originals.access;
    }
});

test("employee can download their own document", async () => {
    stubDocument();
    fs.access = async () => {};

    try {
        const res = makeResponse();
        await downloadEmployeeDocument({
            params: { id: DOCUMENT_ID },
            user: { role: "employee", employeeId: OWNER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
        assert.equal(res.headers["Content-Type"], "application/pdf");
        assert.equal(res.downloaded.fileName, "private-record.pdf");
        assert.ok(res.downloaded.filePath.endsWith("random-storage-name.pdf"));
    } finally {
        EmployeeDocument.findById = originals.findById;
        fs.access = originals.access;
    }
});

test("HR can download an employee document", async () => {
    stubDocument();
    fs.access = async () => {};

    try {
        const res = makeResponse();
        await downloadEmployeeDocument({
            params: { id: DOCUMENT_ID },
            user: { role: "hr", employeeId: OTHER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.downloaded.fileName, "private-record.pdf");
    } finally {
        EmployeeDocument.findById = originals.findById;
        fs.access = originals.access;
    }
});
