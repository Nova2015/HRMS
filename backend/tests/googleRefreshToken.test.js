import test from "node:test";
import assert from "node:assert/strict";
import { requireGoogleRefreshToken } from "../src/utils/googleRefreshToken.js";

test("Google refresh token validation returns an available encrypted token", () => {
    assert.equal(requireGoogleRefreshToken("encrypted-refresh-token"), "encrypted-refresh-token");
});

test("Missing Google refresh token returns a safe reconnect-required 401", () => {
    assert.throws(
        () => requireGoogleRefreshToken(null),
        (error) => error.status === 401 && error.message === "Google authorization is unavailable; reconnect the account"
    );
});
