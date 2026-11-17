import test from "node:test";
import assert from "node:assert/strict";
import { getDatabaseReadiness } from "../src/utils/databaseReadiness.js";

test("database readiness is true only for an established MongoDB connection", () => {
    assert.deepEqual(getDatabaseReadiness(1), {
        ready: true,
        database: "connected"
    });
});

test("database readiness is false while disconnected, connecting, or disconnecting", () => {
    for (const state of [0, 2, 3, 99]) {
        assert.deepEqual(getDatabaseReadiness(state), {
            ready: false,
            database: "disconnected"
        });
    }
});
