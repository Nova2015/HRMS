import test from "node:test";
import assert from "node:assert/strict";
import { createGracefulShutdown } from "../src/utils/gracefulShutdown.js";

const createLogger = () => ({ log() {}, error() {} });

test("graceful shutdown closes HTTP server before disconnecting MongoDB", async () => {
    const calls = [];
    let closeCallback;
    const shutdown = createGracefulShutdown({
        server: {
            close(callback) {
                calls.push("server.close");
                closeCallback = callback;
            }
        },
        disconnect: async () => { calls.push("database.disconnect"); },
        exit: (code) => calls.push(`exit:${code}`),
        logger: createLogger()
    });

    shutdown("SIGTERM");
    assert.deepEqual(calls, ["server.close"]);

    closeCallback();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(calls, ["server.close", "database.disconnect", "exit:0"]);
});

test("graceful shutdown is idempotent when multiple signals arrive", async () => {
    let closeCalls = 0;
    let disconnectCalls = 0;
    let exitCalls = 0;
    let closeCallback;
    const shutdown = createGracefulShutdown({
        server: {
            close(callback) {
                closeCalls += 1;
                closeCallback = callback;
            }
        },
        disconnect: async () => { disconnectCalls += 1; },
        exit: () => { exitCalls += 1; },
        logger: createLogger()
    });

    shutdown("SIGTERM");
    shutdown("SIGINT");
    closeCallback();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(closeCalls, 1);
    assert.equal(disconnectCalls, 1);
    assert.equal(exitCalls, 1);
});

test("shutdown exits with failure if HTTP server close fails", async () => {
    let exitCode;
    let disconnectCalls = 0;
    const shutdown = createGracefulShutdown({
        server: {
            close(callback) {
                callback(new Error("close failed"));
            }
        },
        disconnect: async () => { disconnectCalls += 1; },
        exit: (code) => { exitCode = code; },
        logger: createLogger()
    });

    shutdown("SIGTERM");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(disconnectCalls, 1);
    assert.equal(exitCode, 1);
});

test("shutdown exits with failure if MongoDB disconnect fails", async () => {
    let exitCode;
    let closeCallback;
    const shutdown = createGracefulShutdown({
        server: {
            close(callback) { closeCallback = callback; }
        },
        disconnect: async () => { throw new Error("disconnect failed"); },
        exit: (code) => { exitCode = code; },
        logger: createLogger()
    });

    shutdown("SIGINT");
    closeCallback();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(exitCode, 1);
});
