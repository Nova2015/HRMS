import test from "node:test";
import assert from "node:assert/strict";

import { reserveJobOpeningForHire, reserveOpenJobForCandidate, isValidJoiningDate, isValidResumeUrl, hasValidCandidateFieldLengths, hasValidJobOpeningFieldLengths } from "../src/controllers/recruitmentController.js";
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


test("candidate field lengths accept values at schema limits", () => {
    assert.equal(hasValidCandidateFieldLengths({
        firstName: "A".repeat(80),
        lastName: "B".repeat(80),
        email: `${"a".repeat(242)}@example.com`,
        phone: "1".repeat(25),
        currentCompany: "C".repeat(120),
        resumeUrl: `https://example.com/${"r".repeat(478)}`,
        notes: "N".repeat(2000)
    }), true);
});

test("candidate field lengths reject values exceeding schema limits", () => {
    assert.equal(hasValidCandidateFieldLengths({ firstName: "A".repeat(81), lastName: "B", email: "a@example.com", phone: "1" }), false);
    assert.equal(hasValidCandidateFieldLengths({ firstName: "A", lastName: "B".repeat(81), email: "a@example.com", phone: "1" }), false);
    assert.equal(hasValidCandidateFieldLengths({ firstName: "A", lastName: "B", email: `${"a".repeat(243)}@example.com`, phone: "1" }), false);
    assert.equal(hasValidCandidateFieldLengths({ firstName: "A", lastName: "B", email: "a@example.com", phone: "1".repeat(26) }), false);
    assert.equal(hasValidCandidateFieldLengths({ firstName: "A", lastName: "B", email: "a@example.com", phone: "1", notes: "N".repeat(2001) }), false);
});


test("candidate registration atomically reserves only an open job", async () => {
    const originalUpdate = JobOpening.findOneAndUpdate;
    let filter;
    let update;
    let options;
    try {
        JobOpening.findOneAndUpdate = async (nextFilter, nextUpdate, nextOptions) => {
            filter = nextFilter;
            update = nextUpdate;
            options = nextOptions;
            return { _id: JOB_ID, department: "department-id", designation: "designation-id" };
        };
        const job = await reserveOpenJobForCandidate(JOB_ID, SESSION);
        assert.equal(job._id, JOB_ID);
        assert.deepEqual(filter, { _id: JOB_ID, status: "open" });
        assert.deepEqual(update, { $inc: { hiringVersion: 1 } });
        assert.equal(options.session, SESSION);
    } finally {
        JobOpening.findOneAndUpdate = originalUpdate;
    }
});

test("candidate registration rejects a job closed before its atomic reservation", async () => {
    const originalUpdate = JobOpening.findOneAndUpdate;
    try {
        JobOpening.findOneAndUpdate = async () => null;
        await assert.rejects(
            reserveOpenJobForCandidate(JOB_ID, SESSION),
            (error) => error.code === 409 && /open job position/.test(error.message)
        );
    } finally {
        JobOpening.findOneAndUpdate = originalUpdate;
    }
});


test("job opening field lengths accept values at schema limits", () => {
    assert.equal(hasValidJobOpeningFieldLengths({
        title: "T".repeat(120),
        description: "D".repeat(5000),
        location: "L".repeat(200)
    }), true);
});

test("job opening field lengths reject values exceeding schema limits", () => {
    assert.equal(hasValidJobOpeningFieldLengths({ title: "T".repeat(121), description: "D", location: "L" }), false);
    assert.equal(hasValidJobOpeningFieldLengths({ title: "T", description: "D".repeat(5001), location: "L" }), false);
    assert.equal(hasValidJobOpeningFieldLengths({ title: "T", description: "D", location: "L".repeat(201) }), false);
});
