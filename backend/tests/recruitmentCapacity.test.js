import test from "node:test";
import assert from "node:assert/strict";

import { reserveJobOpeningForHire, isValidJoiningDate, isValidResumeUrl } from "../src/controllers/recruitmentController.js";
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


test("joining date accepts a valid date-only value", () => {
    assert.equal(isValidJoiningDate("2026-11-17"), true);
});

test("joining date rejects impossible calendar dates", () => {
    assert.equal(isValidJoiningDate("2026-02-30"), false);
    assert.equal(isValidJoiningDate("2026-13-01"), false);
});

test("joining date rejects timestamps and non-date input", () => {
    assert.equal(isValidJoiningDate("2026-11-17T00:00:00.000Z"), false);
    assert.equal(isValidJoiningDate("17-11-2026"), false);
    assert.equal(isValidJoiningDate(""), false);
});


test("resume URL accepts empty values and HTTP or HTTPS links", () => {
    assert.equal(isValidResumeUrl(""), true);
    assert.equal(isValidResumeUrl("   "), true);
    assert.equal(isValidResumeUrl("https://example.com/resume.pdf"), true);
    assert.equal(isValidResumeUrl("http://example.com/resume.pdf"), true);
});

test("resume URL rejects executable, data and unsupported schemes", () => {
    assert.equal(isValidResumeUrl("javascript:alert(1)"), false);
    assert.equal(isValidResumeUrl("data:text/html,<script>alert(1)</script>"), false);
    assert.equal(isValidResumeUrl("ftp://example.com/resume.pdf"), false);
    assert.equal(isValidResumeUrl("not-a-url"), false);
});
