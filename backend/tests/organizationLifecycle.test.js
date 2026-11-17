import test from "node:test";
import assert from "node:assert/strict";
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

test("department cannot be deactivated while active employees are assigned", async () => {
    const original = {
        employeeCount: Employee.countDocuments,
        designationCount: Designation.countDocuments,
        update: Department.findByIdAndUpdate
    };
    let updateAttempted = false;
    try {
        Employee.countDocuments = async (filter) => {
            assert.deepEqual(filter, {
                department: ID,
                employmentStatus: "active",
                isArchived: { $ne: true }
            });
            return 1;
        };
        Designation.countDocuments = async () => 0;
        Department.findByIdAndUpdate = async () => { updateAttempted = true; };
        const res = response();
        await updateDepartment({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /active employees or designations/);
        assert.equal(updateAttempted, false);
    } finally {
        Employee.countDocuments = original.employeeCount;
        Designation.countDocuments = original.designationCount;
        Department.findByIdAndUpdate = original.update;
    }
});

test("department cannot be deactivated while active designations remain", async () => {
    const original = {
        employeeCount: Employee.countDocuments,
        designationCount: Designation.countDocuments,
        update: Department.findByIdAndUpdate
    };
    let updateAttempted = false;
    try {
        Employee.countDocuments = async () => 0;
        Designation.countDocuments = async (filter) => {
            assert.deepEqual(filter, { department: ID, isActive: true });
            return 1;
        };
        Department.findByIdAndUpdate = async () => { updateAttempted = true; };
        const res = response();
        await updateDepartment({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 409);
        assert.equal(updateAttempted, false);
    } finally {
        Employee.countDocuments = original.employeeCount;
        Designation.countDocuments = original.designationCount;
        Department.findByIdAndUpdate = original.update;
    }
});

test("designation cannot be deactivated while active employees are assigned", async () => {
    const original = {
        employeeCount: Employee.countDocuments,
        update: Designation.findByIdAndUpdate
    };
    let updateAttempted = false;
    try {
        Employee.countDocuments = async (filter) => {
            assert.deepEqual(filter, {
                designation: ID,
                employmentStatus: "active",
                isArchived: { $ne: true }
            });
            return 2;
        };
        Designation.findByIdAndUpdate = () => {
            updateAttempted = true;
            return { populate: async () => ({ _id: ID }) };
        };
        const res = response();
        await updateDesignation({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /assigned to active employees/);
        assert.equal(updateAttempted, false);
    } finally {
        Employee.countDocuments = original.employeeCount;
        Designation.findByIdAndUpdate = original.update;
    }
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
        Designation.findById = () => ({
            select: async () => ({ department: { toString: () => oldDepartmentId } })
        });
        Employee.countDocuments = async (filter) => {
            assert.deepEqual(filter, { designation: ID });
            return 1;
        };
        Designation.findByIdAndUpdate = () => {
            updateAttempted = true;
            return { populate: async () => ({ _id: ID }) };
        };
        const res = response();
        await updateDesignation({
            params: { id: ID },
            body: { department: newDepartmentId }
        }, res);
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
    const original = {
        employeeCount: Employee.countDocuments,
        update: Designation.findByIdAndUpdate
    };
    try {
        Employee.countDocuments = async () => 0;
        Designation.findByIdAndUpdate = () => ({
            populate: async () => ({ _id: ID, isActive: false })
        });
        const res = response();
        await updateDesignation({ params: { id: ID }, body: { isActive: false } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.isActive, false);
    } finally {
        Employee.countDocuments = original.employeeCount;
        Designation.findByIdAndUpdate = original.update;
    }
});
