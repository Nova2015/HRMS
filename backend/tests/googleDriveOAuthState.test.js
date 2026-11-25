import test from "node:test";
import assert from "node:assert/strict";
import GoogleDriveOAuthState from "../src/models/GoogleDriveOAuthState.js";
import { consumeGoogleDriveOAuthState } from "../src/services/googleDriveOAuthStateService.js";

test("Google Drive OAuth state schema has unique nonce and TTL expiry", () => {
    const indexes = GoogleDriveOAuthState.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => fields.nonce === 1 && options.unique === true));
    assert.ok(indexes.some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test("Google Drive OAuth state is atomically consumed once with session binding", async () => {
    const original = GoogleDriveOAuthState.findOneAndDelete;
    const records = new Map([["drive-nonce", { _id: "state-id", expiresAt: new Date("2030-01-01T00:00:00.000Z") }]]);
    const filters = [];
    GoogleDriveOAuthState.findOneAndDelete = (filter) => {
        filters.push(filter);
        const record = records.get(filter.nonce);
        if (!record || filter.expiresAt.$gt >= record.expiresAt) return { select: async () => null };
        records.delete(filter.nonce);
        return { select: async () => record };
    };
    try {
        const args = {
            nonce: "drive-nonce",
            userId: "507f1f77bcf86cd799439011",
            sessionJti: "drive-session",
            tokenVersion: 3,
            now: new Date("2029-01-01T00:00:00.000Z")
        };
        assert.equal(await consumeGoogleDriveOAuthState(args), true);
        assert.equal(await consumeGoogleDriveOAuthState(args), false);
        assert.equal(filters.length, 2);
        assert.deepEqual(filters[0], {
            nonce: args.nonce,
            userId: args.userId,
            sessionJti: args.sessionJti,
            tokenVersion: 3,
            expiresAt: { $gt: args.now }
        });
    } finally {
        GoogleDriveOAuthState.findOneAndDelete = original;
    }
});

test("Google Drive OAuth state rejects missing session binding without database access", async () => {
    const original = GoogleDriveOAuthState.findOneAndDelete;
    GoogleDriveOAuthState.findOneAndDelete = () => { throw new Error("Unexpected database access"); };
    try {
        assert.equal(await consumeGoogleDriveOAuthState({ nonce: "n", userId: "u" }), false);
        assert.equal(await consumeGoogleDriveOAuthState({ userId: "u", sessionJti: "s" }), false);
    } finally {
        GoogleDriveOAuthState.findOneAndDelete = original;
    }
});
