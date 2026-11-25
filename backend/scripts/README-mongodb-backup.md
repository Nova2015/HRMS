# HRMS MongoDB backup and restore (Windows)

This is a separate database backup from the Google Drive document-storage migration. It runs on the user's Windows PC and writes non-destructive, timestamped MongoDB archive files to local storage.

## Requirements

- Windows PowerShell 5.1 or later.
- MongoDB Database Tools installed; `mongodump.exe` and `mongorestore.exe` must be on PATH.
- Network access to the MongoDB deployment when a backup runs.
- A MongoDB connection URI with read access to the HRMS database. Use a least-privilege backup account where possible.

## One-time setup

Open PowerShell in `D:\HRMS\backend\scripts` and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\configure-mongodb-backup.ps1
.\install-mongodb-backup-task.ps1
```

The URI is entered as a secure prompt and stored encrypted using Windows DPAPI for the current Windows user. It is not written to the backup log or passed as a process command-line argument. The encrypted credential cannot be decrypted by another Windows user or on another PC; run the configuration script again if the Windows profile or PC changes.

## Schedule and backup location

The scheduled task `HRMS MongoDB Backup` runs:
- when the configured Windows user logs on (after PC startup and sign-in);
- daily at 3:00 AM, with missed runs configured to start when the PC becomes available.

Backups are written to:

`%LOCALAPPDATA%\HRMS\Backups\MongoDB`

Logs are written to:

`%LOCALAPPDATA%\HRMS\Logs`

Each backup is a timestamped gzip-compressed mongodump archive plus a JSON manifest containing byte size and SHA-256. The script retries up to three times with a 60-second delay, writes to a temporary `.partial` file, and publishes the archive only after mongodump succeeds. Existing backups are never automatically deleted or mirrored destructively.

If the PC is offline or MongoDB is unreachable, the attempt is logged as failed; the daily scheduled run retries later. A logon run also makes up to three attempts.

## Manual backup

```powershell
.\mongodb-backup.ps1
```

## Restore verification

Restore only into a separate, empty test MongoDB deployment/database first. Do not use the production connection URI for a test restore. The restore script verifies the manifest size and SHA-256, asks for the isolated target URI securely, and requires typing `RESTORE` before writing. It does not use `--drop` and does not delete existing target data.

```powershell
.\restore-mongodb-backup.ps1 -BackupFile "$env:LOCALAPPDATA\HRMS\Backups\MongoDB\hrms-mongodb-YYYYMMDD-HHMMSS.archive.gz"
```

After restore, verify collection counts and key HRMS workflows on the isolated target. A successful mongorestore exit code alone is not a complete disaster-recovery test.

## Scope and limitations

- This is a logical `mongodump` backup of the database selected by the configured URI. Confirm the URI selects the intended HRMS database.
- The backup runs from the Windows PC, not from Render's ephemeral filesystem.
- This implementation stores the database backup locally. It does not yet copy database archives to Google Drive; that is a separate integration step requiring an explicit Drive backup design and a live OAuth connection.
- No automatic retention/deletion policy is enabled. Monitor local disk capacity.
- The scheduled task runs in the configured Windows user's context and requires that user's profile to decrypt the DPAPI credential.
