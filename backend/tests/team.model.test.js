import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Team from "../src/models/Team.js";

const departmentId = new mongoose.Types.ObjectId();

test("Team requires a name, code and existing Department reference", () => {
    const team = new Team({ name: "Electrical", code: "ELEC", department: departmentId });
    assert.equal(team.isActive, true);
    assert.equal(team.description, "");
    assert.equal(team.validateSync(), undefined);
});

test("Team normalizes code and trims name", () => {
    const team = new Team({ name: "  Sales Team  ", code: " sales ", department: departmentId });
    assert.equal(team.name, "Sales Team");
    assert.equal(team.code, "SALES");
    assert.equal(team.validateSync(), undefined);
});

test("Team requires its Department relationship", () => {
    const team = new Team({ name: "HR Team", code: "HR" });
    const error = team.validateSync();
    assert.ok(error);
    assert.ok(error.errors.department);
});

test("Team enforces field length limits", () => {
    const team = new Team({
        name: "T".repeat(101),
        code: "C".repeat(21),
        department: departmentId,
        description: "D".repeat(501)
    });
    const error = team.validateSync();
    assert.ok(error);
    assert.ok(error.errors.name);
    assert.ok(error.errors.code);
    assert.ok(error.errors.description);
});

test("Team has unique department-scoped name and code indexes", () => {
    const indexes = Team.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => fields.department === 1 && fields.name === 1 && options.unique === true));
    assert.ok(indexes.some(([fields, options]) => fields.department === 1 && fields.code === 1 && options.unique === true));
});
