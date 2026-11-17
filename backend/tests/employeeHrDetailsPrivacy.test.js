import test from "node:test";
import assert from "node:assert/strict";
import Employee from "../src/models/Employee.js";
import { getEmployeeHrDetails, updateEmployeeHrDetails } from "../src/controllers/employeeHrDetailsController.js";
import { decryptHrDetails } from "../src/services/hrDetailsCrypto.js";

const OWNER_ID = "64b000000000000000000081";
const OTHER_ID = "64b000000000000000000082";
const originalFindById = Employee.findById;
const originalKey = process.env.HR_DATA_ENCRYPTION_KEY;
process.env.HR_DATA_ENCRYPTION_KEY = "a".repeat(64);

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const makeEmployee = (id, encrypted = "") => ({
    _id: id,
    dateOfBirth: new Date("1990-01-02T00:00:00.000Z"),
    hrDetailsEncrypted: encrypted,
    save: async function () {}
});

const mockFind = (employee, capture) => {
    Employee.findById = (id) => {
        capture?.(id);
        return { select: async () => employee };
    };
};

test("employee HR details request for another ID resolves only to their own record", async () => {
    let queriedId;
    mockFind(makeEmployee(OWNER_ID), (id) => { queriedId = id; });
    try {
        const res = response();
        await getEmployeeHrDetails({
            params: { employeeId: OTHER_ID },
            user: { role: "employee", employeeId: OWNER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(queriedId, OWNER_ID);
    } finally {
        Employee.findById = originalFindById;
    }
});

test("HR can retrieve another employee's HR details with sensitive values masked", async () => {
    const encrypted = (await import("../src/services/hrDetailsCrypto.js")).encryptHrDetails({
        bankAccountNumber: "123456789012",
        panNumber: "ABCDE1234F",
        ifscCode: "HDFC0001234",
        pfNumber: "PF123456",
        uanNumber: "123456789012"
    });
    let queriedId;
    mockFind(makeEmployee(OTHER_ID, encrypted), (id) => { queriedId = id; });
    try {
        const res = response();
        await getEmployeeHrDetails({
            params: { employeeId: OTHER_ID },
            user: { role: "hr", employeeId: OWNER_ID }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(queriedId, OTHER_ID);
        assert.equal(res.body.data.bankAccountNumberMasked, "********9012");
        assert.equal(res.body.data.panNumberMasked, "*******234F");
        assert.equal(res.body.data.uanNumberMasked, "********9012");
        assert.equal("bankAccountNumber" in res.body.data, false);
        assert.equal("panNumber" in res.body.data, false);
    } finally {
        Employee.findById = originalFindById;
    }
});

test("employee HR details update encrypts sensitive values and returns only masked values", async () => {
    const employee = makeEmployee(OWNER_ID);
    mockFind(employee);
    try {
        const res = response();
        await updateEmployeeHrDetails({
            params: {},
            user: { role: "employee", employeeId: OWNER_ID },
            body: {
                bankAccountNumber: "123456789012",
                panNumber: "abcde1234f",
                ifscCode: "hdfc0001234",
                uanNumber: "123456789012"
            }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.bankAccountNumberMasked, "********9012");
        assert.equal(res.body.data.panNumberMasked, "*******234F");
        assert.equal(employee.hrDetailsEncrypted.includes("123456789012"), false);
        assert.deepEqual(decryptHrDetails(employee.hrDetailsEncrypted), {
            bankAccountNumber: "123456789012",
            panNumber: "ABCDE1234F",
            ifscCode: "HDFC0001234",
            uanNumber: "123456789012"
        });
        assert.equal("bankAccountNumber" in res.body.data, false);
    } finally {
        Employee.findById = originalFindById;
    }
});

test("invalid PAN format is rejected without saving HR details", async () => {
    let saved = false;
    const employee = makeEmployee(OWNER_ID);
    employee.save = async () => { saved = true; };
    mockFind(employee);
    try {
        const res = response();
        await updateEmployeeHrDetails({
            params: {},
            user: { role: "employee", employeeId: OWNER_ID },
            body: { panNumber: "NOT-A-PAN" }
        }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(saved, false);
    } finally {
        Employee.findById = originalFindById;
    }
});

test("employee cannot set unsupported HR details fields", async () => {
    const employee = makeEmployee(OWNER_ID);
    mockFind(employee);
    try {
        const res = response();
        await updateEmployeeHrDetails({
            params: {},
            user: { role: "employee", employeeId: OWNER_ID },
            body: { role: "admin" }
        }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(employee.hrDetailsEncrypted, "");
    } finally {
        Employee.findById = originalFindById;
    }
});

test.after(() => {
    if (originalKey === undefined) delete process.env.HR_DATA_ENCRYPTION_KEY;
    else process.env.HR_DATA_ENCRYPTION_KEY = originalKey;
});
