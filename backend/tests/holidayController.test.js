import test from "node:test";
import assert from "node:assert/strict";
import Holiday from "../src/models/Holiday.js";
import {
    getHolidays,
    createHoliday,
    updateHoliday,
    deleteHoliday
} from "../src/controllers/holidayController.js";

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const restore = {};
for (const method of ["find", "create", "findByIdAndUpdate", "findByIdAndDelete"]) {
    restore[method] = Holiday[method];
}

test("employees can only read active holidays", async () => {
    let filter;
    const rows = [{ name: "Republic Day", dateKey: "2027-01-26", isActive: true }];
    Holiday.find = (value) => {
        filter = value;
        return {
            populate() { return this; },
            sort() { return this; },
            limit: async () => rows
        };
    };

    try {
        const res = response();
        await getHolidays({ user: { role: "employee" }, query: {} }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(filter, { isActive: true });
        assert.deepEqual(res.body.data, rows);
    } finally {
        Holiday.find = restore.find;
    }
});

test("Admin can explicitly include inactive holidays and filter by year", async () => {
    let filter;
    Holiday.find = (value) => {
        filter = value;
        return {
            populate() { return this; },
            sort() { return this; },
            limit: async () => []
        };
    };

    try {
        const res = response();
        await getHolidays({
            user: { role: "admin" },
            query: { includeInactive: "true", year: "2027" }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(filter, {
            dateKey: { $gte: "2027-01-01", $lte: "2027-12-31" }
        });
    } finally {
        Holiday.find = restore.find;
    }
});

test("holiday list rejects an invalid year", async () => {
    const res = response();
    await getHolidays({
        user: { role: "hr" },
        query: { year: "27" }
    }, res);
    assert.equal(res.statusCode, 400);
});

test("holiday creation rejects impossible calendar dates", async () => {
    let createCalled = false;
    Holiday.create = async () => { createCalled = true; };

    try {
        const res = response();
        await createHoliday({
            body: { name: "Invalid date", dateKey: "2027-02-30" },
            user: { userId: "64b000000000000000000001" }
        }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(createCalled, false);
    } finally {
        Holiday.create = restore.create;
    }
});

test("holiday creation maps duplicate name/date conflicts to 409", async () => {
    Holiday.create = async () => {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
    };

    try {
        const res = response();
        await createHoliday({
            body: { name: "Republic Day", dateKey: "2027-01-26" },
            user: { userId: "64b000000000000000000001" }
        }, res);
        assert.equal(res.statusCode, 409);
    } finally {
        Holiday.create = restore.create;
    }
});

test("holiday update rejects an invalid ID before querying MongoDB", async () => {
    let updateCalled = false;
    Holiday.findByIdAndUpdate = async () => { updateCalled = true; };

    try {
        const res = response();
        await updateHoliday({ params: { id: "not-an-id" }, body: { name: "Updated" } }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(updateCalled, false);
    } finally {
        Holiday.findByIdAndUpdate = restore.findByIdAndUpdate;
    }
});

test("holiday deletion returns 404 when the holiday does not exist", async () => {
    Holiday.findByIdAndDelete = async () => null;

    try {
        const res = response();
        await deleteHoliday({
            params: { id: "64b000000000000000000001" }
        }, res);
        assert.equal(res.statusCode, 404);
    } finally {
        Holiday.findByIdAndDelete = restore.findByIdAndDelete;
    }
});

test.after(() => {
    for (const method of Object.keys(restore)) Holiday[method] = restore[method];
});
