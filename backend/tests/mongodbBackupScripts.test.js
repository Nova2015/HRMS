import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = (name) => fs.readFileSync(path.resolve(here, "../scripts", name), "utf8");

test("MongoDB backup uses the DPAPI-protected credential and MongoDB archive format", () => {
    const source = script("mongodb-backup.ps1");
    assert.match(source, /ConvertTo-SecureString/);
    assert.match(source, /--config=\$tempConfig/);
    assert.match(source, /--archive=\$tempArchive/);
    assert.match(source, /--gzip/);
    assert.doesNotMatch(source, /--uri=\$mongoUri/);
    assert.match(source, /UTF8Encoding -ArgumentList \$false/);
    assert.match(source, /WriteAllText\(\$tempConfig/);
});

test("MongoDB backup verifies SHA-256 and only publishes a completed temporary archive", () => {
    const source = script("mongodb-backup.ps1");
    assert.match(source, /Get-FileHash[^\n]*SHA256/);
    assert.match(source, /\.partial/);
    assert.match(source, /Move-Item[^\n]*\$finalArchive/);
    assert.match(source, /MaxAttempts = 3/);
    assert.match(source, /Original backups are retained/);
});

test("MongoDB restore validates the manifest and checksum before invoking mongorestore", () => {
    const source = script("restore-mongodb-backup.ps1");
    assert.ok(source.indexOf("Get-FileHash") < source.indexOf("mongorestore"));
    assert.match(source, /actualHash -ne \$manifest\.sha256/);
    assert.match(source, /Type RESTORE/);
    assert.match(source, /--stopOnError/);
    assert.doesNotMatch(source, /\s--drop(?:\s|$)/);
    assert.doesNotMatch(source, /--uri=\$targetUri/);
    assert.match(source, /UTF8Encoding -ArgumentList \$false/);
    assert.match(source, /WriteAllText\(\$restoreConfig/);
});

test("MongoDB backup scheduled task runs at logon and daily without deleting old backups", () => {
    const source = script("install-mongodb-backup-task.ps1");
    assert.match(source, /-AtLogOn/);
    assert.match(source, /-Daily -At "3:00AM"/);
    assert.match(source, /-StartWhenAvailable/);
    assert.doesNotMatch(source, /Unregister-ScheduledTask/);
});
