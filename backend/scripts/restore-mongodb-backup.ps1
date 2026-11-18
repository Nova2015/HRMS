param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$manifestPath = "$BackupFile.json"
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw "Backup archive was not found." }
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Backup manifest is missing; refusing to restore an unverified archive." }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.format -ne "mongodump-archive-gzip") { throw "Unsupported backup archive format." }
$actualHash = (Get-FileHash -LiteralPath $BackupFile -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $manifest.sha256) { throw "Backup SHA-256 verification failed. Restore cancelled." }
if ((Get-Item -LiteralPath $BackupFile).Length -ne [long]$manifest.sizeBytes) { throw "Backup size does not match its manifest. Restore cancelled." }

$mongoRestore = Get-Command "mongorestore" -ErrorAction SilentlyContinue
if (-not $mongoRestore) { throw "mongorestore was not found. Install MongoDB Database Tools and ensure mongorestore.exe is on PATH." }

Write-Host "WARNING: Restore writes data into the MongoDB deployment specified below."
Write-Host "Use a separate, empty test database/deployment first. This script never uses --drop."
$targetUriSecure = Read-Host "Enter the isolated target MongoDB URI" -AsSecureString
if ($targetUriSecure.Length -lt 20) {
    $targetUriSecure.Dispose()
    throw "Target URI is invalid."
}
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($targetUriSecure)
try {
    $targetUri = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $targetUriSecure.Dispose()
}

$confirmation = Read-Host "Type RESTORE to restore this verified archive into the isolated target"
if ($confirmation -cne "RESTORE") { throw "Restore cancelled by user." }
& $mongoRestore.Source "--uri=$targetUri" "--archive=$BackupFile" --gzip --stopOnError
if ($LASTEXITCODE -ne 0) { throw "mongorestore exited with code $LASTEXITCODE." }
Write-Host "Restore command completed. Verify collections and application workflows on the isolated target before relying on this backup."
