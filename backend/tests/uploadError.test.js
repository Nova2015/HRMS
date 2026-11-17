import test from "node:test";
import assert from "node:assert/strict";
import { getUploadErrorResponse } from "../src/utils/uploadError.js";

test("file size limit returns 413", () => {
    assert.deepEqual(
        getUploadErrorResponse({ code: "LIMIT_FILE_SIZE" }, "Document"),
        { status: 413, message: "Document must be 10 MB or smaller" }
    );
});

test("unexpected file field returns 400 instead of server error", () => {
    const result = getUploadErrorResponse({ code: "LIMIT_UNEXPECTED_FILE" }, "Receipt");
    assert.equal(result.status, 400);
    assert.match(result.message, /unexpected file field/);
});

test("multipart field and part limits return 400", () => {
    for (const code of ["LIMIT_FIELD_COUNT", "LIMIT_FIELD_VALUE", "LIMIT_PART_COUNT", "LIMIT_FILE_COUNT"]) {
        assert.equal(getUploadErrorResponse({ code }, "Document").status, 400, code);
    }
});

test("file type validation errors return 400", () => {
    assert.deepEqual(
        getUploadErrorResponse(new Error("Unsupported file type"), "Receipt"),
        { status: 400, message: "Only PDF, JPG and PNG receipts are allowed" }
    );
});

test("filesystem storage errors remain 500", () => {
    assert.deepEqual(
        getUploadErrorResponse({ code: "ENOSPC" }, "Document"),
        { status: 500, message: "Unable to store document" }
    );
});
