import test from "node:test";
import assert from "node:assert/strict";
import { excludeTestEmployeeStages } from "../src/utils/reportAggregation.js";

test("report employee pipeline joins employee records before filtering test data", () => {
    assert.deepEqual(excludeTestEmployeeStages(), [
        {
            $lookup: {
                from: "employees",
                localField: "employee",
                foreignField: "_id",
                as: "reportEmployee"
            }
        },
        { $unwind: "$reportEmployee" },
        { $match: { "reportEmployee.isTestRecord": { $ne: true } } }
    ]);
});
