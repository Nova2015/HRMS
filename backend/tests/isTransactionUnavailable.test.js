import test from "node:test";
import assert from "node:assert/strict";
import { isTransactionUnavailable } from "../src/utils/isTransactionUnavailable.js";

test("recognizes retryable MongoDB transaction labels", () => {
    for (const label of ["TransientTransactionError", "UnknownTransactionCommitResult"]) {
        assert.equal(isTransactionUnavailable({
            hasErrorLabel: (candidate) => candidate === label
        }), true);
    }
});

test("recognizes unsupported transaction topology errors", () => {
    for (const message of [
        "Transaction numbers are only allowed on a replica set member or mongos",
        "This deployment is not a replica set"
    ]) {
        assert.equal(isTransactionUnavailable({ message }), true);
    }
});

test("does not classify ordinary application or validation errors as transaction outages", () => {
    assert.equal(isTransactionUnavailable(new Error("Validation failed")), false);
    assert.equal(isTransactionUnavailable(null), false);
    assert.equal(isTransactionUnavailable({ code: 11000, message: "duplicate key" }), false);
});
