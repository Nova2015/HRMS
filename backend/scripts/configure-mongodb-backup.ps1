$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$credentialPath = Join-Path $env:LOCALAPPDATA "HRMS\mongodb-backup-uri.dpapi"
$directory = Split-Path -Parent $credentialPath
New-Item -ItemType Directory -Force -Path $directory | Out-Null

Write-Host "Enter the MongoDB connection URI for the HRMS database."
Write-Host "The URI is encrypted with Windows DPAPI for this Windows user and is never written to the backup log."
$uri = Read-Host "MongoDB URI" -AsSecureString
if ($uri.Length -lt 20) {
    $uri.Dispose()
    throw "The supplied MongoDB URI is too short. No credential was saved."
}
$encrypted = ConvertFrom-SecureString -SecureString $uri
$encrypted | Set-Content -LiteralPath $credentialPath -Encoding ASCII
$uri.Dispose()
Write-Host "Encrypted MongoDB backup credential saved to: $credentialPath"
Write-Host "Only the same Windows user on this PC can decrypt this DPAPI-protected value."
