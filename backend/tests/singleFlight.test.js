import test from "node:test";
import assert from "node:assert/strict";
import { runSingleFlight } from "../src/utils/singleFlight.js";

test("concurrent operations with the same key share one execution and result", async () => {
    let executions = 0;
    let release;
    const operation = () => {
        executions += 1;
        return new Promise((resolve) => { release = resolve; });
    };

    const first = runSingleFlight("user-1", operation);
    const second = runSingleFlight("user-1", operation);
    await Promise.resolve();
    assert.equal(executions, 1);
    release("shared-result");
    assert.deepEqual(await Promise.all([first, second]), ["shared-result", "shared-result"]);
});

test("single-flight operations with different keys run independently", async () => {
    let executions = 0;
    const operation = async () => ++executions;
    const [first, second] = await Promise.all([
        runSingleFlight("user-a", operation),
        runSingleFlight("user-b", operation)
    ]);
    assert.deepEqual([first, second], [1, 2]);
});

test("failed single-flight operation is cleared so a later retry can run", async () => {
    await assert.rejects(runSingleFlight("user-retry", async () => {
        throw new Error("temporary failure");
    }), /temporary failure/);
    assert.equal(await runSingleFlight("user-retry", async () => "retry-ok"), "retry-ok");
});
