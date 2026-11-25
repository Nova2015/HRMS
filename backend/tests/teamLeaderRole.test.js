import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Team from "../src/models/Team.js";

test("User accepts team_leader as a distinct login role", () => {
    const user = new User({
        employee: new mongoose.Types.ObjectId(),
        email: "leader@example.test",
        passwordHash: "hashed-password",
        role: "team_leader"
    });

    assert.equal(user.role, "team_leader");
    assert.equal(user.validateSync(), undefined);
});

test("Team stores an optional Primary Team Leader employee reference", () => {
    const team = new Team({
        name: "Engineering",
        code: "ENG",
        department: new mongoose.Types.ObjectId(),
        primaryTeamLeader: new mongoose.Types.ObjectId()
    });

    assert.equal(team.validateSync(), undefined);
    assert.equal(Team.schema.path("primaryTeamLeader").options.ref, "Employee");
    assert.equal(Team.schema.path("primaryTeamLeader").options.default, null);
});
