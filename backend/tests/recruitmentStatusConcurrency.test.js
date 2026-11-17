import test from "node:test";
import assert from "node:assert/strict";

import Candidate from "../src/models/Candidate.js";
import { updateCandidateStatus } from "../src/controllers/recruitmentController.js";

const ID = "64b000000000000000000041";

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
});

const populatedQuery = (candidate) => ({
    populate() { return this; },
    then(resolve, reject) { return Promise.resolve(candidate).then(resolve, reject); }
});

test("candidate pipeline status update uses an atomic guard against concurrent hiring", async () => {
    const originalUpdate = Candidate.findOneAndUpdate;
    const originalFindById = Candidate.findById;
    let capturedFilter;
    let capturedUpdate;
    let capturedOptions;
    const candidate = { _id: ID };
    try {
        Candidate.findOneAndUpdate = async (filter, update, options) => {
            capturedFilter = filter;
            capturedUpdate = update;
            capturedOptions = options;
            return candidate;
        };
        Candidate.findById = () => populatedQuery(candidate);
        const res = response();
        await updateCandidateStatus({ params: { id: ID }, body: { status: "screening" } }, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(capturedFilter, { _id: ID, status: { $ne: "hired" }, employee: null });
        assert.deepEqual(capturedUpdate, { $set: { status: "screening" } });
        assert.deepEqual(capturedOptions, { new: true, runValidators: true });
    } finally {
        Candidate.findOneAndUpdate = originalUpdate;
        Candidate.findById = originalFindById;
    }
});

test("candidate pipeline status update returns conflict if candidate is already hired", async () => {
    const originalUpdate = Candidate.findOneAndUpdate;
    const originalFindById = Candidate.findById;
    try {
        Candidate.findOneAndUpdate = async () => null;
        Candidate.findById = () => ({
            select: async () => ({ _id: ID })
        });
        const res = response();
        await updateCandidateStatus({ params: { id: ID }, body: { status: "screening" } }, res);

        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /already been hired/);
    } finally {
        Candidate.findOneAndUpdate = originalUpdate;
        Candidate.findById = originalFindById;
    }
});
