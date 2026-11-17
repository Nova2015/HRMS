import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
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

const withTransactionStubs = async ({ assignedCount, shiftActive = true, updateResult = { _id: ID, isActive: false }, deleteResult = { _id: ID } }, run) => {
    const originals = {
        startSession: mongoose.startSession,
        findById: Shift.findById,
        findOneAndUpdate: Shift.findOneAndUpdate,
        findByIdAndUpdate: Shift.findByIdAndUpdate,
        findByIdAndDelete: Shift.findByIdAndDelete,
        countDocuments: Employee.countDocuments
    };
    const session = {
        ended: false,
        async withTransaction(callback) { return callback(); },
        async endSession() { this.ended = true; }
    };
    try {
        mongoose.startSession = async () => session;
        Shift.findById = async () => ({ _id: ID, isActive: true, startTime: "09:00", endTime: "18:00" });
        Shift.findOneAndUpdate = async (filter, update, options) => {
            assert.equal(filter._id, ID);
            if (filter.isActive !== undefined) assert.equal(filter.isActive, true);
            assert.deepEqual(update, { $inc: { assignmentVersion: 1 } });
            assert.equal(options.session, session);
            return shiftActive ? { _id: ID, isActive: true } : null;
        };
        Employee.countDocuments = (filter) => ({
            session: async (providedSession) => {
                assert.equal(providedSession, session);
                return assignedCount;
            }
        });
        Shift.findByIdAndUpdate = async (id, update, options) => {
            assert.equal(id, ID);
            assert.equal(options.session, session);
            return updateResult;
        };
        Shift.findByIdAndDelete = async (id, options) => {
            assert.equal(id, ID);
            assert.equal(options.session, session);
            return deleteResult;
        };
        await run({ session });
    } finally {
        mongoose.startSession = originals.startSession;
        Shift.findById = originals.findById;
        Shift.findOneAndUpdate = originals.findOneAndUpdate;
        Shift.findByIdAndUpdate = originals.findByIdAndUpdate;
        Shift.findByIdAndDelete = originals.findByIdAndDelete;
        Employee.countDocuments = originals.countDocuments;
    }
};

test("shift cannot be deactivated while any non-archived employee remains assigned", async () => {
    await withTransactionStubs({ assignedCount: 1 }, async ({ session }) => {
        const res = response();
        await updateShift({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /Reassign employees/);
        assert.equal(session.ended, true);
    });
});

test("shift can be deactivated after all non-archived employees are reassigned", async () => {
    await withTransactionStubs({ assignedCount: 0 }, async ({ session }) => {
        const res = response();
        await updateShift({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.isActive, false);
        assert.equal(session.ended, true);
    });
});

test("shift deletion remains blocked while archived employee records still reference it", async () => {
    await withTransactionStubs({ assignedCount: 1 }, async ({ session }) => {
        const res = response();
        await deleteShift({ params: { id: ID } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /assigned to employees/);
        assert.equal(session.ended, true);
    });
});
