$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptPath = Join-Path $PSScriptRoot "mongodb-backup.ps1"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "mongodb-backup.ps1 was not found beside this installer."
}
if (-not (Get-Command "mongodump" -ErrorAction SilentlyContinue)) {
    throw "MongoDB Database Tools are required. Install them and ensure mongodump.exe is on PATH."
}
$credentialPath = Join-Path $env:LOCALAPPDATA "HRMS\mongodb-backup-uri.dpapi"
if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
    throw "Configure the encrypted MongoDB URI first by running configure-mongodb-backup.ps1."
}

$taskName = "HRMS MongoDB Backup"
$powerShell = (Get-Command "powershell.exe" -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`""
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At "3:00AM"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logonTrigger, $dailyTrigger) -Settings $settings -Description "Creates a verified, non-destructive HRMS MongoDB backup on this PC at user logon and daily at 3 AM." -Force | Out-Null
Write-Host "Scheduled task '$taskName' installed."
Write-Host "It runs after this Windows user logs in and daily at 3:00 AM. Missed daily runs start when the PC becomes available."
Write-Host "Backups are stored under $env:LOCALAPPDATA\HRMS\Backups\MongoDB. Existing backups are never automatically deleted."
