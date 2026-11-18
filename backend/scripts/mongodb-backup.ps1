$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$BackupRoot = Join-Path $env:LOCALAPPDATA "HRMS\Backups\MongoDB"
$CredentialPath = Join-Path $env:LOCALAPPDATA "HRMS\mongodb-backup-uri.dpapi"
$LogRoot = Join-Path $env:LOCALAPPDATA "HRMS\Logs"
$MaxAttempts = 3
$RetryDelaySeconds = 60

New-Item -ItemType Directory -Force -Path $BackupRoot, $LogRoot | Out-Null
$LogPath = Join-Path $LogRoot ("mongodb-backup-{0}.log" -f (Get-Date -Format "yyyyMMdd"))
function Write-Log([string]$Message) {
    Add-Content -LiteralPath $LogPath -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message) -Encoding UTF8
}

function Get-MongoUri {
    if (-not (Test-Path -LiteralPath $CredentialPath -PathType Leaf)) {
        throw "MongoDB backup credentials are not configured. Run configure-mongodb-backup.ps1 first."
    }
    $encrypted = Get-Content -LiteralPath $CredentialPath -Raw
    $secure = ConvertTo-SecureString $encrypted
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secure.Dispose()
    }
}

try {
    $mongodump = Get-Command "mongodump" -ErrorAction SilentlyContinue
    if (-not $mongodump) { throw "mongodump was not found. Install MongoDB Database Tools and ensure mongodump.exe is on PATH." }
    $mongoUri = Get-MongoUri
    if ([string]::IsNullOrWhiteSpace($mongoUri)) { throw "Stored MongoDB backup URI is empty." }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $finalArchive = Join-Path $BackupRoot "hrms-mongodb-$stamp.archive.gz"
    $tempArchive = "$finalArchive.partial"
    $success = $false

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            if (Test-Path -LiteralPath $tempArchive) { Remove-Item -LiteralPath $tempArchive -Force }
            Write-Log "Backup attempt $attempt of $MaxAttempts started."
            $tempConfig = Join-Path $BackupRoot "mongodb-backup-$stamp.config.tmp"
            $yamlUri = $mongoUri | ConvertTo-Json -Compress
            $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
            [System.IO.File]::WriteAllText($tempConfig, "uri: $yamlUri", $utf8NoBom)
            try {
                & $mongodump.Source "--config=$tempConfig" "--archive=$tempArchive" --gzip --quiet 2>$null
                if ($LASTEXITCODE -ne 0) { throw "mongodump exited with code $LASTEXITCODE." }
            }
            finally {
                if (Test-Path -LiteralPath $tempConfig) { Remove-Item -LiteralPath $tempConfig -Force -ErrorAction SilentlyContinue }
            }
            if (-not (Test-Path -LiteralPath $tempArchive -PathType Leaf)) { throw "mongodump did not create an archive." }
            $file = Get-Item -LiteralPath $tempArchive
            if ($file.Length -lt 1) { throw "mongodump created an empty archive." }

            $hash = (Get-FileHash -LiteralPath $tempArchive -Algorithm SHA256).Hash.ToLowerInvariant()
            Move-Item -LiteralPath $tempArchive -Destination $finalArchive
            $manifest = [ordered]@{
                format = "mongodump-archive-gzip"
                createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
                fileName = [IO.Path]::GetFileName($finalArchive)
                sizeBytes = $file.Length
                sha256 = $hash
                tool = "mongodump"
                attempt = $attempt
            }
            $manifestPath = "$finalArchive.json"
            $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
            Write-Log "SUCCESS: $([IO.Path]::GetFileName($finalArchive)); bytes=$($file.Length); sha256=$hash. Original backups are retained."
            $success = $true
            break
        }
        catch {
            if (Test-Path -LiteralPath $tempArchive) { Remove-Item -LiteralPath $tempArchive -Force -ErrorAction SilentlyContinue }
            Write-Log "Attempt $attempt failed: $($_.Exception.Message)"
            if ($attempt -lt $MaxAttempts) { Start-Sleep -Seconds $RetryDelaySeconds }
        }
    }
    if (-not $success) { throw "All MongoDB backup attempts failed. See $LogPath." }
}
catch {
    Write-Log "BACKUP FAILED: $($_.Exception.Message)"
    exit 1
}
