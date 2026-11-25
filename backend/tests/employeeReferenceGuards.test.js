import test from "node:test";
import assert from "node:assert/strict";
import Department from "../src/models/Department.js";
import Designation from "../src/models/Designation.js";
import Shift from "../src/models/Shift.js";
import Team from "../src/models/Team.js";
import Employee from "../src/models/Employee.js";
import {
    lockEmployeeReferences,
    lockReportingManager,
    lockDepartmentReference,
    lockDesignationReference,
    lockShiftReference,
    lockTeamReference
} from "../src/services/employeeReferenceGuards.js";

const DEPARTMENT_ID = "64b000000000000000000061";
const DESIGNATION_ID = "64b000000000000000000062";
const SHIFT_ID = "64b000000000000000000063";
const TEAM_ID = "64b000000000000000000066";
const MANAGER_ID = "64b000000000000000000064";

const withMethodStubs = async (stubs, run) => {
    const originals = stubs.map(([Model, method]) => [Model, method, Model[method]]);
    try {
        for (const [Model, method, implementation] of stubs) Model[method] = implementation;
        await run();
    } finally {
        for (const [Model, method, original] of originals) Model[method] = original;
    }
};

test("employee reference guard atomically locks active department, designation and shift", async () => {
    const session = {};
    const calls = [];
    await withMethodStubs([
        [Department, "findOneAndUpdate", async (filter, update, options) => {
            calls.push(["department", filter, update, options]);
            return { _id: DEPARTMENT_ID, isActive: true };
        }],
        [Designation, "findOneAndUpdate", async (filter, update, options) => {
            calls.push(["designation", filter, update, options]);
            return { _id: DESIGNATION_ID, isActive: true, department: DEPARTMENT_ID };
        }],
        [Shift, "findOneAndUpdate", async (filter, update, options) => {
            calls.push(["shift", filter, update, options]);
            return { _id: SHIFT_ID, isActive: true };
        }]
    ], async () => {
        await lockEmployeeReferences({
            departmentId: DEPARTMENT_ID,
            designationId: DESIGNATION_ID,
            shiftId: SHIFT_ID,
            session
        });
    });
    assert.deepEqual(calls.map(([name]) => name), ["department", "designation", "shift"]);
    for (const [, filter, update, options] of calls) {
        assert.equal(filter.isActive, true);
        assert.deepEqual(update, { $inc: { assignmentVersion: 1 } });
        assert.equal(options.session, session);
    }
});

test("employee reference guard rejects inactive references", async () => {
    const session = {};
    await withMethodStubs([
        [Department, "findOneAndUpdate", async () => null]
    ], async () => {
        await assert.rejects(
            lockDepartmentReference(DEPARTMENT_ID, session),
            (error) => error.code === "REFERENCE_INACTIVE"
        );
    });
});

test("employee reference guard rejects a designation from another department", async () => {
    await withMethodStubs([
        [Department, "findOneAndUpdate", async () => ({ _id: DEPARTMENT_ID, isActive: true })],
        [Designation, "findOneAndUpdate", async () => ({
            _id: DESIGNATION_ID, isActive: true, department: "64b000000000000000000065"
        })]
    ], async () => {
        await assert.rejects(
            lockEmployeeReferences({ departmentId: DEPARTMENT_ID, designationId: DESIGNATION_ID, session: {} }),
            (error) => error.code === "REFERENCE_MISMATCH"
        );
    });
});

test("reporting manager guard writes the target employee in the caller transaction", async () => {
    const session = {};
    let captured;
    await withMethodStubs([
        [Employee, "findOneAndUpdate", async (filter, update, options) => {
            captured = { filter, update, options };
            return { _id: MANAGER_ID };
        }]
    ], async () => {
        await lockReportingManager(MANAGER_ID, session);
    });
    assert.deepEqual(captured.filter, {
        _id: MANAGER_ID, employmentStatus: "active", isArchived: { $ne: true }
    });
    assert.deepEqual(captured.update, { $inc: { hierarchyVersion: 1 } });
    assert.equal(captured.options.session, session);
});

test("department, designation and shift deactivation use active-only transactional locks", async () => {
    const session = {};
    for (const [Model, lock, id] of [
        [Department, lockDepartmentReference, DEPARTMENT_ID],
        [Designation, lockDesignationReference, DESIGNATION_ID],
        [Shift, lockShiftReference, SHIFT_ID]
    ]) {
        let options;
        await withMethodStubs([
            [Model, "findOneAndUpdate", async (filter, update, passedOptions) => {
                assert.deepEqual(filter, { _id: id, isActive: true });
                assert.deepEqual(update, { $inc: { assignmentVersion: 1 } });
                options = passedOptions;
                return { _id: id };
            }]
        ], async () => lock(id, session));
        assert.equal(options.session, session);
    }
});


test("team reference guard locks only an active team in the selected department", async () => {
    const session = {};
    let captured;
    await withMethodStubs([
        [Team, "findOneAndUpdate", async (filter, update, options) => {
            captured = { filter, update, options };
            return { _id: TEAM_ID, department: DEPARTMENT_ID, isActive: true };
        }]
    ], async () => {
        await lockTeamReference(TEAM_ID, DEPARTMENT_ID, session);
    });
    assert.deepEqual(captured.filter, {
        _id: TEAM_ID, department: DEPARTMENT_ID, isActive: true
    });
    assert.deepEqual(captured.update, { $inc: { assignmentVersion: 1 } });
    assert.equal(captured.options.session, session);
});

test("team reference guard rejects inactive or cross-department teams", async () => {
    await withMethodStubs([
        [Team, "findOneAndUpdate", async () => null]
    ], async () => {
        await assert.rejects(
            lockTeamReference(TEAM_ID, DEPARTMENT_ID, {}),
            (error) => error.code === "TEAM_INVALID" && error.statusCode === 409
        );
    });
});
