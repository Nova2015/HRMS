import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import AuditLog from "../src/models/AuditLog.js";
import { loginRateLimit } from "../src/middleware/loginRateLimit.js";

test("Login rate limit returns 429 and audits the blocked request without credentials", async () => {
    const originalCreate = AuditLog.create;
    const logs = [];
    AuditLog.create = async (entry) => {
        logs.push(entry);
        return entry;
    };

    const ip = `rate-limit-test-${randomUUID()}`;
    const makeRequest = () => ({
        ip,
        socket: { remoteAddress: ip },
        method: "POST",
        originalUrl: "/api/auth/login",
        body: { email: "private@example.com", password: "never-log-this" },
        get: (name) => name === "user-agent" ? "HRMS rate-limit test" : ""
    });

    try {
        for (let attempt = 1; attempt <= 10; attempt += 1) {
            let continued = false;
            const response = {
                set() { return this; },
                status() { throw new Error("Unexpected rate limit before attempt 11"); }
            };
            loginRateLimit(makeRequest(), response, () => { continued = true; });
            assert.equal(continued, true);
        }

        let statusCode = 200;
        let responseBody;
        let retryAfter;
        const response = {
            set(name, value) {
                if (name === "Retry-After") retryAfter = value;
                return this;
            },
            status(code) {
                statusCode = code;
                return this;
            },
            json(body) {
                responseBody = body;
                return this;
            }
        };

        loginRateLimit(makeRequest(), response, () => {
            throw new Error("Blocked request must not continue");
        });
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(statusCode, 429);
        assert.equal(responseBody.success, false);
        assert.ok(Number(retryAfter) > 0);
        assert.equal(logs.length, 1);
        assert.equal(logs[0].action, "login.rate_limited");
        assert.equal(logs[0].module, "auth");
        assert.equal(logs[0].role, "system");
        assert.equal(logs[0].statusCode, 429);
        assert.equal(logs[0].ipAddress, ip);
        assert.equal(JSON.stringify(logs[0]).includes("private@example.com"), false);
        assert.equal(JSON.stringify(logs[0]).includes("never-log-this"), false);
    } finally {
        AuditLog.create = originalCreate;
    }
});


test("login rate limiter evicts oldest buckets when the active-key cap is reached", () => {
    const prefix = `rate-limit-cap-test-${randomUUID()}`;
    const makeRequest = (ip) => ({
        ip,
        socket: { remoteAddress: ip },
        method: "POST",
        originalUrl: "/api/auth/login",
        get: () => "HRMS bucket cap test"
    });
    const pass = () => {
        let continued = false;
        const response = {
            set() { return this; },
            status(code) { throw new Error(`Unexpected rate-limit response: ${code}`); },
            json(body) { throw new Error(body.message); }
        };
        loginRateLimit(makeRequest(prefix), response, () => { continued = true; });
        assert.equal(continued, true);
    };

    for (let attempt = 0; attempt < 10; attempt += 1) pass();

    for (let index = 0; index < 10000; index += 1) {
        let continued = false;
        const ip = `${prefix}-${index}`;
        const response = {
            set() { return this; },
            status(code) { throw new Error(`Unexpected rate-limit response: ${code}`); },
            json(body) { throw new Error(body.message); }
        };
        loginRateLimit(makeRequest(ip), response, () => { continued = true; });
        assert.equal(continued, true);
    }

    // The oldest key is evicted at capacity, so memory remains bounded.
    pass();
});
