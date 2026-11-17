import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Employee from "../src/models/Employee.js";
import Department from "../src/models/Department.js";
import Designation from "../src/models/Designation.js";
import { updateDepartment } from "../src/controllers/departmentController.js";
import { updateDesignation } from "../src/controllers/designationController.js";

const ID = "64b000000000000000000041";
const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
});
const makeQuery = (value) => ({
    session() { return this; },
    populate() { return this; },
    select() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
});
const withTransactionStubs = async (overrides, run) => {
    const originals = {
        startSession: mongoose.startSession,
        employeeCount: Employee.countDocuments,
        designationCount: Designation.countDocuments,
        departmentLock: Department.findOneAndUpdate,
        designationLock: Designation.findOneAndUpdate,
        departmentUpdate: Department.findByIdAndUpdate,
        designationUpdate: Designation.findByIdAndUpdate
    };
    const session = { async withTransaction(fn) { return fn(); }, async endSession() {} };
    try {
        mongoose.startSession = async () => session;
        Employee.countDocuments = overrides.employeeCount || (() => makeQuery(0));
        Designation.countDocuments = overrides.designationCount || (() => makeQuery(0));
        Department.findOneAndUpdate = overrides.departmentLock || (async () => ({ _id: ID, isActive: true }));
        Designation.findOneAndUpdate = overrides.designationLock || (async () => ({
            _id: ID, isActive: true, department: ID
        }));
        Department.findByIdAndUpdate = overrides.departmentUpdate || (async () => ({ _id: ID, isActive: false }));
        Designation.findByIdAndUpdate = overrides.designationUpdate || (() => ({
            populate: async () => ({ _id: ID, isActive: false })
        }));
        await run(session);
    } finally {
        mongoose.startSession = originals.startSession;
        Employee.countDocuments = originals.employeeCount;
        Designation.countDocuments = originals.designationCount;
        Department.findOneAndUpdate = originals.departmentLock;
        Designation.findOneAndUpdate = originals.designationLock;
        Department.findByIdAndUpdate = originals.departmentUpdate;
        Designation.findByIdAndUpdate = originals.designationUpdate;
    }
};

test("department cannot be deactivated while active employees are assigned", async () => {
    let updateAttempted = false;
    await withTransactionStubs({
        employeeCount: (filter) => {
            assert.deepEqual(filter, { department: ID, employmentStatus: "active", isArchived: { $ne: true } });
            return makeQuery(1);
        },
        departmentUpdate: async () => { updateAttempted = true; }
    }, async () => {
        const res = response();
        await updateDepartment({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /active employees or designations/);
        assert.equal(updateAttempted, false);
    });
});

test("department cannot be deactivated while active designations remain", async () => {
    let updateAttempted = false;
    await withTransactionStubs({
        employeeCount: () => makeQuery(0),
        designationCount: (filter) => {
            assert.deepEqual(filter, { department: ID, isActive: true });
            return makeQuery(1);
        },
        departmentUpdate: async () => { updateAttempted = true; }
    }, async () => {
        const res = response();
        await updateDepartment({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 409);
        assert.equal(updateAttempted, false);
    });
});

test("designation cannot be deactivated while active employees are assigned", async () => {
    let updateAttempted = false;
    await withTransactionStubs({
        employeeCount: (filter) => {
            assert.deepEqual(filter, { designation: ID, employmentStatus: "active", isArchived: { $ne: true } });
            return makeQuery(2);
        },
        designationUpdate: () => {
            updateAttempted = true;
            return { populate: async () => ({ _id: ID }) };
        }
    }, async () => {
        const res = response();
        await updateDesignation({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /assigned to active employees/);
        assert.equal(updateAttempted, false);
    });
});

test("designation cannot move to another department while employee records reference it", async () => {
    const original = {
        employeeCount: Employee.countDocuments,
        designationFindById: Designation.findById,
        designationUpdate: Designation.findByIdAndUpdate,
        departmentFindById: Department.findById
    };
    let updateAttempted = false;
    const oldDepartmentId = "64b000000000000000000042";
    const newDepartmentId = "64b000000000000000000043";
    try {
        Department.findById = async () => ({ isActive: true });
        Designation.findById = () => ({ select: async () => ({ department: { toString: () => oldDepartmentId } }) });
        Employee.countDocuments = async (filter) => {
            assert.deepEqual(filter, { designation: ID });
            return 1;
        };
        Designation.findByIdAndUpdate = () => {
            updateAttempted = true;
            return { populate: async () => ({ _id: ID }) };
        };
        const res = response();
        await updateDesignation({ params: { id: ID }, body: { department: newDepartmentId } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /cannot be moved to another department/);
        assert.equal(updateAttempted, false);
    } finally {
        Employee.countDocuments = original.employeeCount;
        Designation.findById = original.designationFindById;
        Designation.findByIdAndUpdate = original.designationUpdate;
        Department.findById = original.departmentFindById;
    }
});

test("designation can be deactivated when no active employees are assigned", async () => {
    await withTransactionStubs({
        employeeCount: () => makeQuery(0)
    }, async () => {
        const res = response();
        await updateDesignation({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.isActive, false);
    });
});
