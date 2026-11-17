import test from "node:test";
import assert from "node:assert/strict";

import { reserveJobOpeningForHire } from "../src/controllers/recruitmentController.js";
import Candidate from "../src/models/Candidate.js";
import JobOpening from "../src/models/JobOpening.js";

const JOB_ID = "64b000000000000000000041";
const SESSION = { id: "test-session" };

const withStubs = async ({ job, hiredCount }, run) => {
    const originalFindOneAndUpdate = JobOpening.findOneAndUpdate;
    const originalCountDocuments = Candidate.countDocuments;
    let capturedJobFilter;
    let capturedJobUpdate;
    let capturedJobOptions;
    let capturedCountFilter;
    try {
        JobOpening.findOneAndUpdate = async (filter, update, options) => {
            capturedJobFilter = filter;
            capturedJobUpdate = update;
            capturedJobOptions = options;
            return job;
        };
        Candidate.countDocuments = (filter) => {
            capturedCountFilter = filter;
            return {
                session: async (session) => {
                    assert.equal(session, SESSION);
                    return hiredCount;
                }
            };
        };
        await run({
            get capturedJobFilter() { return capturedJobFilter; },
            get capturedJobUpdate() { return capturedJobUpdate; },
            get capturedJobOptions() { return capturedJobOptions; },
            get capturedCountFilter() { return capturedCountFilter; }
        });
    } finally {
        JobOpening.findOneAndUpdate = originalFindOneAndUpdate;
        Candidate.countDocuments = originalCountDocuments;
    }
};

test("hiring reserves the job document and allows a candidate while capacity remains", async () => {
    await withStubs({ job: { _id: JOB_ID, openings: 2 }, hiredCount: 1 }, async (captured) => {
        await reserveJobOpeningForHire({ jobOpening: JOB_ID }, SESSION);

        assert.deepEqual(captured.capturedJobFilter, { _id: JOB_ID });
        assert.deepEqual(captured.capturedJobUpdate, { $inc: { hiringVersion: 1 } });
        assert.equal(captured.capturedJobOptions.session, SESSION);
        assert.deepEqual(captured.capturedCountFilter, { jobOpening: JOB_ID, status: "hired" });
    });
});

test("hiring is rejected when all job openings have been filled", async () => {
    await withStubs({ job: { _id: JOB_ID, openings: 2 }, hiredCount: 2 }, async () => {
        await assert.rejects(
            reserveJobOpeningForHire({ jobOpening: JOB_ID }, SESSION),
            (error) => error.code === 409 && /All openings.*filled/.test(error.message)
        );
    });
});

test("hiring is rejected when the candidate job opening no longer exists", async () => {
    await withStubs({ job: null, hiredCount: 0 }, async () => {
        await assert.rejects(
            reserveJobOpeningForHire({ jobOpening: JOB_ID }, SESSION),
            (error) => error.code === 409 && /no longer exists/.test(error.message)
        );
    });
});
