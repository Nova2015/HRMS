import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Employee from "../src/models/Employee.js";
import User from "../src/models/User.js";
import {
    archiveEmployee,
    deactivateEmployee,
    activateEmployee,
    updateEmployee
} from "../src/controllers/employeeController.js";

const EMPLOYEE_ID = "64b000000000000000000031";
const ACTOR_ID = "64b000000000000000000032";

const createResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    }
});

const withStubs = async ({ employeeMethod, employeeQuery, employeeArchived = false, employeeStatus = "active", userUpdate, save }, run) => {
    const original = {
        startSession: mongoose.startSession,
        findById: Employee.findById,
        findOne: Employee.findOne,
        findOneAndUpdate: User.findOneAndUpdate
    };
    const session = {
        ended: false,
        async withTransaction(callback) {
            return callback();
        },
        async endSession() {
            this.ended = true;
        }
    };
    const employee = {
        _id: EMPLOYEE_ID,
        employmentStatus: employeeStatus,
        isArchived: employeeArchived,
        async save(options) {
            save?.(options);
        }
    };

    try {
        mongoose.startSession = async () => session;
        if (employeeMethod === "findById") {
            Employee.findById = () => ({
                session: async (providedSession) => {
                    assert.equal(providedSession, session);
                    return employeeQuery === null ? null : employee;
                }
            });
        } else {
            Employee.findOne = () => ({
                session: async (providedSession) => {
                    assert.equal(providedSession, session);
                    return employeeQuery === null ? null : employee;
                }
            });
        }
        User.findOneAndUpdate = async (filter, update, options) => {
            assert.deepEqual(filter, { employee: EMPLOYEE_ID });
            assert.equal(options.session, session);
            userUpdate?.(update);
            return employeeQuery === "missing-account" ? null : { _id: "64b000000000000000000033" };
        };
        await run({ session, employee });
    } finally {
        mongoose.startSession = original.startSession;
        Employee.findById = original.findById;
        Employee.findOne = original.findOne;
        User.findOneAndUpdate = original.findOneAndUpdate;
    }
};

test("deactivateEmployee updates Employee and User in the same transaction", async () => {
    let employeeSaveSession;
    let capturedUserUpdate;
    await withStubs({
        employeeMethod: "findById",
        userUpdate: (update) => { capturedUserUpdate = update; },
        save: (options) => { employeeSaveSession = options.session; }
    }, async ({ session, employee }) => {
        const res = createResponse();
        await deactivateEmployee({ params: { id: EMPLOYEE_ID } , user: { userId: ACTOR_ID } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(employee.employmentStatus, "inactive");
        assert.deepEqual(capturedUserUpdate, { $set: { isActive: false }, $inc: { tokenVersion: 1 } });
        assert.equal(employeeSaveSession, session);
        assert.equal(session.ended, true);
    });
});

test("activateEmployee updates Employee and User in the same transaction", async () => {
    let employeeSaveSession;
    let capturedUserUpdate;
    await withStubs({
        employeeMethod: "findById",
        userUpdate: (update) => { capturedUserUpdate = update; },
        save: (options) => { employeeSaveSession = options.session; }
    }, async ({ session, employee }) => {
        employee.employmentStatus = "inactive";
        const res = createResponse();
        await activateEmployee({ params: { id: EMPLOYEE_ID } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(employee.employmentStatus, "active");
        assert.deepEqual(capturedUserUpdate, { $set: { isActive: true } });
        assert.equal(employeeSaveSession, session);
        assert.equal(session.ended, true);
    });
});

test("updateEmployee refuses archived employees before changing profile or login", async () => {
    const originalFindById = Employee.findById;
    const originalUserFindOne = User.findOne;
    let userLookupAttempted = false;
    try {
        Employee.findById = () => Promise.resolve({
            _id: EMPLOYEE_ID,
            isArchived: true
        });
        User.findOne = () => {
            userLookupAttempted = true;
            throw new Error("Archived employee must be rejected before account lookup");
        };
        const res = createResponse();
        await updateEmployee({
            params: { id: EMPLOYEE_ID },
            body: { employmentStatus: "active" },
            user: { role: "admin" }
        }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /Archived employees cannot be edited or reactivated/);
        assert.equal(userLookupAttempted, false);
    } finally {
        Employee.findById = originalFindById;
        User.findOne = originalUserFindOne;
    }
});

test("updateEmployee refuses to reactivate resigned or terminated employees through profile editing", async (t) => {
    for (const employmentStatus of ["resigned", "terminated"]) {
        await t.test(employmentStatus, async () => {
            const originalFindById = Employee.findById;
            const originalUserFindOne = User.findOne;
            let userLookupAttempted = false;
            try {
                Employee.findById = () => Promise.resolve({
                    _id: EMPLOYEE_ID,
                    isArchived: false,
                    employmentStatus
                });
                User.findOne = () => {
                    userLookupAttempted = true;
                    throw new Error("Ended employment must be rejected before account lookup");
                };
                const res = createResponse();
                await updateEmployee({
                    params: { id: EMPLOYEE_ID },
                    body: { employmentStatus: "active" },
                    user: { role: "admin" }
                }, res);
                assert.equal(res.statusCode, 409);
                assert.match(res.body.message, /Resigned or terminated employees cannot be reactivated/);
                assert.equal(userLookupAttempted, false);
            } finally {
                Employee.findById = originalFindById;
                User.findOne = originalUserFindOne;
            }
        });
    }
});

test("updateEmployee prevents changing terminal employment status back to inactive", async (t) => {
    for (const employmentStatus of ["resigned", "terminated"]) {
        await t.test(employmentStatus, async () => {
            const originalFindById = Employee.findById;
            const originalUserFindOne = User.findOne;
            let userLookupAttempted = false;
            try {
                Employee.findById = () => Promise.resolve({
                    _id: EMPLOYEE_ID,
                    isArchived: false,
                    employmentStatus
                });
                User.findOne = () => {
                    userLookupAttempted = true;
                    throw new Error("Terminal employment status must be immutable");
                };
                const res = createResponse();
                await updateEmployee({
                    params: { id: EMPLOYEE_ID },
                    body: { employmentStatus: "inactive" },
                    user: { role: "admin" }
                }, res);
                assert.equal(res.statusCode, 409);
                assert.match(res.body.message, /Employment status cannot be changed after resignation or termination/);
                assert.equal(userLookupAttempted, false);
            } finally {
                Employee.findById = originalFindById;
                User.findOne = originalUserFindOne;
            }
        });
    }
});

test("activateEmployee refuses archived employees without re-enabling their login", async () => {
    let userUpdateAttempted = false;
    let employeeSaveAttempted = false;
    await withStubs({
        employeeMethod: "findById",
        employeeArchived: true,
        userUpdate: () => { userUpdateAttempted = true; },
        save: () => { employeeSaveAttempted = true; }
    }, async ({ session }) => {
        const res = createResponse();
        await activateEmployee({ params: { id: EMPLOYEE_ID } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /Archived employees cannot be reactivated/);
        assert.equal(userUpdateAttempted, false);
        assert.equal(employeeSaveAttempted, false);
        assert.equal(session.ended, true);
    });
});

test("activateEmployee refuses resigned and terminated employees without re-enabling login", async (t) => {
    for (const employmentStatus of ["resigned", "terminated"]) {
        await t.test(employmentStatus, async () => {
            let userUpdateAttempted = false;
            let employeeSaveAttempted = false;
            await withStubs({
                employeeMethod: "findById",
                employeeStatus: employmentStatus,
                userUpdate: () => { userUpdateAttempted = true; },
                save: () => { employeeSaveAttempted = true; }
            }, async ({ session }) => {
                const res = createResponse();
                await activateEmployee({ params: { id: EMPLOYEE_ID } }, res);
                assert.equal(res.statusCode, 409);
                assert.match(res.body.message, /Resigned or terminated employees cannot be reactivated/);
                assert.equal(userUpdateAttempted, false);
                assert.equal(employeeSaveAttempted, false);
                assert.equal(session.ended, true);
            });
        });
    }
});

test("archiveEmployee updates archive metadata and disables login in the same transaction", async () => {
    let employeeSaveSession;
    let capturedUserUpdate;
    await withStubs({
        employeeMethod: "findOne",
        userUpdate: (update) => { capturedUserUpdate = update; },
        save: (options) => { employeeSaveSession = options.session; }
    }, async ({ session, employee }) => {
        const res = createResponse();
        await archiveEmployee({ params: { id: EMPLOYEE_ID }, user: { userId: ACTOR_ID } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(employee.isArchived, true);
        assert.equal(employee.employmentStatus, "inactive");
        assert.ok(employee.archivedAt instanceof Date);
        assert.equal(employee.archivedBy, ACTOR_ID);
        assert.deepEqual(capturedUserUpdate, { $set: { isActive: false }, $inc: { tokenVersion: 1 } });
        assert.equal(employeeSaveSession, session);
        assert.equal(session.ended, true);
    });
});

test("lifecycle operations return conflict and end the transaction when login account is missing", async () => {
    await withStubs({
        employeeMethod: "findById",
        employeeQuery: "missing-account"
    }, async ({ session }) => {
        const res = createResponse();
        await deactivateEmployee({ params: { id: EMPLOYEE_ID } }, res);
        assert.equal(res.statusCode, 409);
        assert.equal(session.ended, true);
    });
});

test("lifecycle operations do not save Employee when a transaction write fails", async () => {
    let saveAttempted = false;
    await withStubs({
        employeeMethod: "findById",
        save: () => {
            saveAttempted = true;
            throw new Error("simulated database write failure");
        }
    }, async ({ session }) => {
        const res = createResponse();
        await deactivateEmployee({ params: { id: EMPLOYEE_ID } }, res);
        assert.equal(res.statusCode, 500);
        assert.equal(saveAttempted, true);
        assert.equal(session.ended, true);
    });
});
