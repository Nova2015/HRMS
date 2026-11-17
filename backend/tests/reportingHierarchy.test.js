import test from "node:test";
import assert from "node:assert/strict";
import Employee from "../src/models/Employee.js";
import { createsReportingCycle } from "../src/services/reportingHierarchy.js";

const A = "64b000000000000000000041";
const B = "64b000000000000000000042";
const C = "64b000000000000000000043";
const D = "64b000000000000000000044";

const withHierarchy = async (hierarchy, run) => {
    const originalFindById = Employee.findById;
    const visited = [];
    try {
        Employee.findById = (id) => ({
            select: (fields) => {
                assert.equal(fields, "reportingManager");
                return {
                    lean: async () => {
                        visited.push(String(id));
                        return hierarchy[String(id)] || null;
                    }
                };
            }
        });
        await run(visited);
    } finally {
        Employee.findById = originalFindById;
    }
};

test("reporting hierarchy accepts an acyclic manager chain", async () => {
    await withHierarchy({
        [B]: { reportingManager: C },
        [C]: { reportingManager: D },
        [D]: { reportingManager: null }
    }, async () => {
        assert.equal(await createsReportingCycle(A, B), false);
    });
});

test("reporting hierarchy rejects assigning a subordinate as manager", async () => {
    await withHierarchy({
        [C]: { reportingManager: B },
        [B]: { reportingManager: A }
    }, async (visited) => {
        assert.equal(await createsReportingCycle(A, C), true);
        assert.deepEqual(visited, [C, B]);
    });
});

test("reporting hierarchy rejects an already-cyclic manager chain", async () => {
    await withHierarchy({
        [B]: { reportingManager: C },
        [C]: { reportingManager: B }
    }, async () => {
        assert.equal(await createsReportingCycle(A, B), true);
    });
});
