import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../src/models/User.js";
import { protect } from "../src/middleware/authMiddleware.js";

const SECRET = "auth-middleware-test-secret-with-at-least-32-characters";
const USER_ID = "64b000000000000000000011";

const originalFindById = User.findById;

test("protect forwards database failures to Express error handling", async () => {
    const databaseError = new Error("MongoDB temporarily unavailable");
    process.env.JWT_SECRET = SECRET;
    User.findById = () => ({
        select: async () => { throw databaseError; }
    });

    const req = {
        headers: {
            authorization: `Bearer ${jwt.sign({ userId: USER_ID, tokenVersion: 0 }, SECRET)}`
        }
    };
    let statusCode;
    let responseBody;
    let forwardedError;
    let nextCalled = false;
    const res = {
        status(code) { statusCode = code; return this; },
        json(body) { responseBody = body; return this; }
    };

    try {
        await protect(req, res, (error) => {
            if (error) forwardedError = error;
            else nextCalled = true;
        });

        assert.equal(forwardedError, databaseError);
        assert.equal(statusCode, undefined);
        assert.equal(responseBody, undefined);
        assert.equal(nextCalled, false);
    } finally {
        User.findById = originalFindById;
    }
});

test("protect still returns 401 for an invalid JWT", async () => {
    process.env.JWT_SECRET = SECRET;
    const req = { headers: { authorization: "Bearer invalid.token.value" } };
    let statusCode;
    let responseBody;
    let forwardedError;
    const res = {
        status(code) { statusCode = code; return this; },
        json(body) { responseBody = body; return this; }
    };

    await protect(req, res, (error) => { forwardedError = error; });

    assert.equal(statusCode, 401);
    assert.equal(responseBody.success, false);
    assert.equal(forwardedError, undefined);
});
