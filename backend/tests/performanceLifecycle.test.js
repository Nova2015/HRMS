import test from "node:test";
import assert from "node:assert/strict";
import Employee from "../src/models/Employee.js";
import PerformanceReview from "../src/models/PerformanceReview.js";
import { submitManagerReview } from "../src/controllers/performanceController.js";

const MANAGER_ID = "64b000000000000000000201";
const EMPLOYEE_ID = "64b000000000000000000202";
const REVIEW_ID = "64b000000000000000000203";

const originals = {
    employeeFindById: Employee.findById,
    reviewFindById: PerformanceReview.findById,
    reviewFindOneAndUpdate: PerformanceReview.findOneAndUpdate
};

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const runManagerReview = async (employeeState) => {
    let updateCalled = false;
    Employee.findById = () => ({
        select: async () => ({
            reportingManager: MANAGER_ID,
            employmentStatus: employeeState.employmentStatus,
            isArchived: employeeState.isArchived
        })
    });
    PerformanceReview.findById = async () => ({
        _id: REVIEW_ID,
        employee: EMPLOYEE_ID,
        status: "self_submitted"
    });
    PerformanceReview.findOneAndUpdate = async () => {
        updateCalled = true;
        return null;
    };

    const res = response();
    await submitManagerReview({
        params: { id: REVIEW_ID },
        body: { rating: 4, comments: "Good progress", finalize: false },
        user: { role: "manager", employeeId: MANAGER_ID, userId: MANAGER_ID }
    }, res);
    return { res, updateCalled };
};

test("manager cannot review an inactive former direct report", async () => {
    try {
        const { res, updateCalled } = await runManagerReview({
            employmentStatus: "inactive",
            isArchived: false
        });
        assert.equal(res.statusCode, 403);
        assert.equal(updateCalled, false);
    } finally {
        Employee.findById = originals.employeeFindById;
        PerformanceReview.findById = originals.reviewFindById;
        PerformanceReview.findOneAndUpdate = originals.reviewFindOneAndUpdate;
    }
});

test("manager cannot review an archived direct report", async () => {
    try {
        const { res, updateCalled } = await runManagerReview({
            employmentStatus: "active",
            isArchived: true
        });
        assert.equal(res.statusCode, 403);
        assert.equal(updateCalled, false);
    } finally {
        Employee.findById = originals.employeeFindById;
        PerformanceReview.findById = originals.reviewFindById;
        PerformanceReview.findOneAndUpdate = originals.reviewFindOneAndUpdate;
    }
});

test.after(() => {
    Employee.findById = originals.employeeFindById;
    PerformanceReview.findById = originals.reviewFindById;
    PerformanceReview.findOneAndUpdate = originals.reviewFindOneAndUpdate;
});
