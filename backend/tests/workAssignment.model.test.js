import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import WorkAssignment, {
    WORK_ASSIGNMENT_STATUSES,
    WORK_ASSIGNMENT_PRIORITIES
} from "../src/models/WorkAssignment.js";

const id = () => new mongoose.Types.ObjectId();

const validAssignment = () => ({
    title: "Prepare monthly production report",
    department: id(),
    team: id(),
    assignedBy: id(),
    assignedTo: id(),
    reviewer: id(),
    givenDays: 5,
    dueDate: new Date(Date.now() + 5 * 86400000)
});

test("WorkAssignment requires its organization and assignment references", () => {
    const assignment = new WorkAssignment(validAssignment());
    assert.equal(assignment.validateSync(), undefined);
    assert.equal(assignment.status, "assigned");
    assert.equal(assignment.priority, "medium");
    assert.equal(assignment.delegationDepth, 0);
});

test("WorkAssignment requires title, department, team, assignee, assigner, reviewer and due date", () => {
    const assignment = new WorkAssignment({ title: "Incomplete" });
    const error = assignment.validateSync();
    assert.ok(error);
    for (const field of ["department", "team", "assignedBy", "assignedTo", "reviewer", "givenDays", "dueDate"]) {
        assert.ok(error.errors[field], field);
    }
});

test("WorkAssignment enforces supported statuses and priorities", () => {
    assert.ok(WORK_ASSIGNMENT_STATUSES.includes("submitted_for_review"));
    assert.ok(WORK_ASSIGNMENT_STATUSES.includes("rework_required"));
    assert.ok(WORK_ASSIGNMENT_PRIORITIES.includes("urgent"));
    const assignment = new WorkAssignment({ ...validAssignment(), status: "approved", priority: "critical" });
    const error = assignment.validateSync();
    assert.ok(error.errors.status);
    assert.ok(error.errors.priority);
});

test("WorkAssignment validates bounded title, description, remarks and duration", () => {
    const assignment = new WorkAssignment({
        ...validAssignment(),
        title: "T".repeat(181),
        description: "D".repeat(10001),
        completionRemarks: "R".repeat(4001),
        givenDays: 0
    });
    const error = assignment.validateSync();
    assert.ok(error.errors.title);
    assert.ok(error.errors.description);
    assert.ok(error.errors.completionRemarks);
    assert.ok(error.errors.givenDays);
});

test("WorkAssignment supports linked parent/root delegation and append-only history records", () => {
    const rootId = id();
    const assignment = new WorkAssignment({
        ...validAssignment(),
        parentAssignment: id(),
        rootAssignment: rootId,
        delegationDepth: 1,
        history: [{
            action: "delegated",
            actorUser: id(),
            actorEmployee: id(),
            fromStatus: "assigned",
            toStatus: "assigned",
            note: "Delegated to team member"
        }]
    });
    assert.equal(assignment.rootAssignment.toString(), rootId.toString());
    assert.equal(assignment.delegationDepth, 1);
    assert.equal(assignment.history.length, 1);
    assert.equal(assignment.validateSync(), undefined);
});

test("WorkAssignment includes indexes for assignee queues, reviewer inbox and hierarchy", () => {
    const indexes = WorkAssignment.schema.indexes().map(([fields]) => fields);
    assert.ok(indexes.some((fields) => fields.assignedTo === 1 && fields.status === 1 && fields.dueDate === 1));
    assert.ok(indexes.some((fields) => fields.reviewer === 1 && fields.status === 1));
    assert.ok(indexes.some((fields) => fields.rootAssignment === 1));
});
