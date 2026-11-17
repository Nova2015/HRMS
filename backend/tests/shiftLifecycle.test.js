import test from "node:test";
import assert from "node:assert/strict";
import Shift from "../src/models/Shift.js";
import Employee from "../src/models/Employee.js";
import { updateShift, deleteShift } from "../src/controllers/shiftController.js";

const ID = "64b000000000000000000051";
const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
});

test("shift cannot be deactivated while any non-archived employee remains assigned", async () => {
    const original = {
        findById: Shift.findById,
        count: Employee.countDocuments,
        update: Shift.findByIdAndUpdate
    };
    let updateAttempted = false;
    try {
        Shift.findById = async () => ({ _id: ID, isActive: true, startTime: "09:00", endTime: "18:00" });
        Employee.countDocuments = async (filter) => {
            assert.deepEqual(filter, { shift: ID, isArchived: { $ne: true } });
            return 1;
        };
        Shift.findByIdAndUpdate = async () => { updateAttempted = true; };
        const res = response();
        await updateShift({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /Reassign employees/);
        assert.equal(updateAttempted, false);
    } finally {
        Shift.findById = original.findById;
        Employee.countDocuments = original.count;
        Shift.findByIdAndUpdate = original.update;
    }
});

test("shift can be deactivated after all non-archived employees are reassigned", async () => {
    const original = {
        findById: Shift.findById,
        count: Employee.countDocuments,
        update: Shift.findByIdAndUpdate
    };
    try {
        Shift.findById = async () => ({ _id: ID, isActive: true, startTime: "09:00", endTime: "18:00" });
        Employee.countDocuments = async () => 0;
        Shift.findByIdAndUpdate = () => ({ then: (resolve) => resolve({ _id: ID, isActive: false }) });
        const res = response();
        await updateShift({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.isActive, false);
    } finally {
        Shift.findById = original.findById;
        Employee.countDocuments = original.count;
        Shift.findByIdAndUpdate = original.update;
    }
});

test("shift deletion remains blocked while archived employee records still reference it", async () => {
    const original = {
        count: Employee.countDocuments,
        remove: Shift.findByIdAndDelete
    };
    let deleteAttempted = false;
    try {
        Employee.countDocuments = async (filter) => {
            assert.deepEqual(filter, { shift: ID });
            return 1;
        };
        Shift.findByIdAndDelete = async () => { deleteAttempted = true; };
        const res = response();
        await deleteShift({ params: { id: ID } }, res);
        assert.equal(res.statusCode, 409);
        assert.equal(deleteAttempted, false);
    } finally {
        Employee.countDocuments = original.count;
        Shift.findByIdAndDelete = original.remove;
    }
});
