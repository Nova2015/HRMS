import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Employee from "../src/models/Employee.js";

test("Employee supports an optional Team reference for backward compatibility", () => {
    const employee = new Employee({
        employeeCode: "TEAM001",
        firstName: "Test",
        lastName: "Employee",
        email: "team001@example.test",
        department: new mongoose.Types.ObjectId(),
        designation: new mongoose.Types.ObjectId(),
        joiningDate: new Date("2026-01-01")
    });

    assert.equal(employee.team, null);
    assert.equal(employee.validateSync(), undefined);
});

test("Employee Team field references the Team model", () => {
    const teamPath = Employee.schema.path("team");
    assert.ok(teamPath);
    assert.equal(teamPath.options.ref, "Team");
    assert.equal(teamPath.options.default, null);
});
