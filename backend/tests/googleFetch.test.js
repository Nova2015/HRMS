import test from "node:test";
import assert from "node:assert/strict";
import { googleFetch } from "../src/utils/googleFetch.js";

test("Google fetch returns a successful response", async () => {
    const response = { ok: true, status: 200 };
    const result = await googleFetch("https://example.test", {}, 100, async () => response);
    assert.equal(result, response);
});

test("Google fetch converts network failures to a safe 502 error", async () => {
    await assert.rejects(
        googleFetch("https://example.test", {}, 100, async () => { throw new Error("private socket details"); }),
        (error) => error.status === 502 && error.message === "Could not reach Google services; try again"
    );
});

test("Google fetch aborts requests that exceed the timeout", async () => {
    await assert.rejects(
        googleFetch("https://example.test", {}, 10, (_url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
            }, { once: true });
        })),
        (error) => error.status === 504 && error.message === "Google service request timed out; try again"
    );
});


test("Google fetch timeout signal remains active after response headers arrive", async () => {
    let requestSignal;
    const response = { ok: true, status: 200 };
    const result = await googleFetch("https://example.test", {}, 15, async (_url, options) => {
        requestSignal = options.signal;
        return response;
    });
    assert.equal(result, response);
    assert.equal(requestSignal.aborted, false);
    await new Promise((resolve) => requestSignal.addEventListener("abort", resolve, { once: true }));
    assert.equal(requestSignal.aborted, true);
});
