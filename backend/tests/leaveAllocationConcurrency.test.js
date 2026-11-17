import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Employee from "../src/models/Employee.js";
import LeaveRequest from "../src/models/LeaveRequest.js";
import LeaveAllocation from "../src/models/LeaveAllocation.js";
import { saveLeaveAllocation } from "../src/controllers/leaveAllocationController.js";

const EMPLOYEE_ID = "64b000000000000000000081";
const ACTOR_ID = "64b000000000000000000082";

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
});

const withStubs = async ({ usage, matchedCount = 1, onSave }, run) => {
    const original = {
        startSession: mongoose.startSession,
        employeeFindOne: Employee.findOne,
        employeeUpdateOne: Employee.updateOne,
        leaveAggregate: LeaveRequest.aggregate,
        allocationUpdate: LeaveAllocation.findOneAndUpdate
    };
    const session = {
        ended: false,
        async withTransaction(callback) { return callback(); },
        async endSession() { this.ended = true; }
    };
    const allocation = {
        employee: { _id: EMPLOYEE_ID },
        casual: 10,
        sick: 10,
        earned: 10,
        toObject() { return { employee: this.employee, casual: this.casual, sick: this.sick, earned: this.earned }; }
    };
    let lockAttempted = false;
    let saveAttempted = false;
    try {
        mongoose.startSession = async () => session;
        Employee.findOne = () => ({ select: async () => ({ _id: EMPLOYEE_ID }) });
        Employee.updateOne = async (filter, update, options) => {
            lockAttempted = true;
            assert.deepEqual(filter, { _id: EMPLOYEE_ID, employmentStatus: "active", isArchived: { $ne: true } });
            assert.deepEqual(update, { $inc: { leaveRequestVersion: 1 } });
            assert.equal(options.session, session);
            return { matchedCount };
        };
        LeaveRequest.aggregate = () => ({
            session: async (providedSession) => {
                assert.equal(providedSession, session);
                return usage;
            }
        });
        LeaveAllocation.findOneAndUpdate = (filter, update, options) => {
            saveAttempted = true;
            assert.deepEqual(filter, { employee: EMPLOYEE_ID, year: 2026 });
            assert.deepEqual(update, { $set: { casual: 10, sick: 10, earned: 10, updatedBy: ACTOR_ID } });
            assert.equal(options.session, session);
            return { populate: async () => allocation };
        };
        await run({ session, getState: () => ({ lockAttempted, saveAttempted }) });
    } finally {
        mongoose.startSession = original.startSession;
        Employee.findOne = original.employeeFindOne;
        Employee.updateOne = original.employeeUpdateOne;
        LeaveRequest.aggregate = original.leaveAggregate;
        LeaveAllocation.findOneAndUpdate = original.allocationUpdate;
    }
};

const request = () => ({
    body: { employeeId: EMPLOYEE_ID, year: 2026, casual: 10, sick: 10, earned: 10 },
    user: { userId: ACTOR_ID }
});

test("leave allocation update serializes with employee leave submissions", async () => {
    await withStubs({ usage: [] }, async ({ session, getState }) => {
        const res = response();
        await saveLeaveAllocation(request(), res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(getState().lockAttempted, true);
        assert.equal(getState().saveAttempted, true);
        assert.equal(session.ended, true);
    });
});

test("leave allocation cannot be reduced below pending or approved leave reservations", async () => {
    await withStubs({ usage: [{ _id: "casual", total: 12 }] }, async ({ session, getState }) => {
        const res = response();
        await saveLeaveAllocation(request(), res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /below 12 day\(s\) already pending or approved/);
        assert.equal(getState().lockAttempted, true);
        assert.equal(getState().saveAttempted, false);
        assert.equal(session.ended, true);
    });
});

test("leave allocation update aborts when employee becomes inactive before serialization", async () => {
    await withStubs({ usage: [], matchedCount: 0 }, async ({ session, getState }) => {
        const res = response();
        await saveLeaveAllocation(request(), res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /Active employee not found/);
        assert.equal(getState().lockAttempted, true);
        assert.equal(getState().saveAttempted, false);
        assert.equal(session.ended, true);
    });
});
