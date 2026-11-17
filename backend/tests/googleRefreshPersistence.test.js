import test from "node:test";
import assert from "node:assert/strict";
import { persistGoogleRefreshIfUnchanged } from "../src/utils/googleRefreshPersistence.js";

const makeModel = (result) => {
    const calls = [];
    return {
        calls,
        findOneAndUpdate(filter, update, options) {
            calls.push({ filter, update, options });
            return { select: (fields) => {
                calls.push({ selected: fields });
                return Promise.resolve(result);
            } };
        }
    };
};

test("Google refresh persistence uses compare-and-set against the connection snapshot", async () => {
    const snapshot = {
        _id: "integration-1",
        accessTokenEncrypted: "old-access",
        refreshTokenEncrypted: "refresh-snapshot",
        connectedAt: new Date("2026-01-01T00:00:00.000Z")
    };
    const persisted = { accessTokenEncrypted: "new-access", tokenExpiresAt: new Date("2026-01-01T01:00:00.000Z") };
    const model = makeModel(persisted);

    const result = await persistGoogleRefreshIfUnchanged({
        model, snapshot, accessTokenEncrypted: "new-access", tokenExpiresAt: persisted.tokenExpiresAt
    });

    assert.equal(result, persisted);
    assert.deepEqual(model.calls[0].filter, {
        _id: snapshot._id,
        accessTokenEncrypted: snapshot.accessTokenEncrypted,
        refreshTokenEncrypted: snapshot.refreshTokenEncrypted,
        connectedAt: snapshot.connectedAt
    });
    assert.deepEqual(model.calls[0].update, {
        $set: { accessTokenEncrypted: "new-access", tokenExpiresAt: persisted.tokenExpiresAt }
    });
    assert.deepEqual(model.calls[0].options, { new: true, runValidators: true });
    assert.equal(model.calls[1].selected, "+accessTokenEncrypted +refreshTokenEncrypted");
});

test("Google refresh persistence returns null when reconnect or disconnect changed the snapshot", async () => {
    const model = makeModel(null);
    const result = await persistGoogleRefreshIfUnchanged({
        model,
        snapshot: {
            _id: "integration-2",
            accessTokenEncrypted: "stale-access",
            refreshTokenEncrypted: "stale-refresh",
            connectedAt: new Date("2026-01-01T00:00:00.000Z")
        },
        accessTokenEncrypted: "stale-refreshed-access",
        tokenExpiresAt: new Date("2026-01-01T01:00:00.000Z")
    });
    assert.equal(result, null);
});
