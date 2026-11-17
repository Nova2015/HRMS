import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { passwordChangeRateLimit } from "../src/middleware/passwordChangeRateLimit.js";

const makeResponse = () => {
    let statusCode = 200;
    let body;
    let retryAfter;
    return {
        set(name, value) {
            if (name === "Retry-After") retryAfter = value;
            return this;
        },
        status(code) {
            statusCode = code;
            return this;
        },
        json(value) {
            body = value;
            return this;
        },
        get statusCode() { return statusCode; },
        get body() { return body; },
        get retryAfter() { return retryAfter; }
    };
};

test("password change rate limit allows five attempts per user and blocks the sixth", () => {
    const userId = randomUUID();
    for (let attempt = 0; attempt < 5; attempt += 1) {
        let continued = false;
        passwordChangeRateLimit({ user: { userId } }, makeResponse(), () => { continued = true; });
        assert.equal(continued, true);
    }

    const response = makeResponse();
    passwordChangeRateLimit({ user: { userId } }, response, () => {
        throw new Error("Blocked request must not continue");
    });

    assert.equal(response.statusCode, 429);
    assert.equal(response.body.success, false);
    assert.ok(Number(response.retryAfter) > 0);
});

test("password change rate limit is isolated by authenticated user", () => {
    const userA = randomUUID();
    const userB = randomUUID();
    for (let attempt = 0; attempt < 5; attempt += 1) {
        passwordChangeRateLimit({ user: { userId: userA } }, makeResponse(), () => {});
    }

    let continued = false;
    passwordChangeRateLimit({ user: { userId: userB } }, makeResponse(), () => { continued = true; });
    assert.equal(continued, true);
});

test("password change rate limit rejects requests without an authenticated user", () => {
    const response = makeResponse();
    passwordChangeRateLimit({}, response, () => {
        throw new Error("Unauthenticated request must not continue");
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.success, false);
});
