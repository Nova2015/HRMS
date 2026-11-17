import test from "node:test";
import assert from "node:assert/strict";
import GoogleOAuthState from "../src/models/GoogleOAuthState.js";
import { consumeGoogleOAuthState } from "../src/services/googleOAuthStateService.js";

test("Google OAuth state schema enforces unique nonces and automatic expiry", () => {
    const indexes = GoogleOAuthState.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => fields.nonce === 1 && options.unique === true));
    assert.ok(indexes.some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test("Google OAuth state is atomically consumed only once", async () => {
    const originalFindOneAndDelete = GoogleOAuthState.findOneAndDelete;
    const records = new Map([["nonce-once", { _id: "state-id" }]]);
    const filters = [];

    GoogleOAuthState.findOneAndDelete = (filter) => {
        filters.push(filter);
        const record = records.get(filter.nonce);
        if (!record || filter.expiresAt.$gt >= new Date("2030-01-01T00:00:00.000Z")) {
            return { select: async () => null };
        }
        records.delete(filter.nonce);
        return { select: async () => record };
    };

    try {
        const args = {
            nonce: "nonce-once",
            userId: "507f1f77bcf86cd799439011",
            sessionJti: "session-jti",
            tokenVersion: 2,
            now: new Date("2029-01-01T00:00:00.000Z")
        };
        assert.equal(await consumeGoogleOAuthState(args), true);
        assert.equal(await consumeGoogleOAuthState(args), false);
        assert.equal(filters.length, 2);
        assert.deepEqual(filters[0], {
            nonce: "nonce-once",
            userId: args.userId,
            sessionJti: args.sessionJti,
            tokenVersion: 2,
            expiresAt: { $gt: args.now }
        });
    } finally {
        GoogleOAuthState.findOneAndDelete = originalFindOneAndDelete;
    }
});

test("Google OAuth state consumption rejects missing nonce or session without database access", async () => {
    const originalFindOneAndDelete = GoogleOAuthState.findOneAndDelete;
    GoogleOAuthState.findOneAndDelete = () => {
        throw new Error("Database should not be queried for invalid state");
    };
    try {
        assert.equal(await consumeGoogleOAuthState({ userId: "user", sessionJti: "session" }), false);
        assert.equal(await consumeGoogleOAuthState({ nonce: "nonce", userId: "user" }), false);
    } finally {
        GoogleOAuthState.findOneAndDelete = originalFindOneAndDelete;
    }
});
