param(
    [string]$OutputDirectory = ""
)

$ErrorActionPreference = 'Stop'
$serverRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envFile = Join-Path $serverRoot '.env'

if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $name, $value = $line -split '=', 2
        $name = $name.Trim()
        $value = $value.Trim().Trim('"').Trim("'")
        if ($name -and -not [Environment]::GetEnvironmentVariable($name)) {
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

$required = 'DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_NAME'
foreach ($name in $required) {
    if (-not [Environment]::GetEnvironmentVariable($name)) {
        throw "Falta la variable $name para realizar el backup."
    }
}

$backupRoot = if ($OutputDirectory) {
    [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $serverRoot 'backups'))
}
$serverPrefix = $serverRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if ($backupRoot -ne $serverRoot -and -not $backupRoot.StartsWith($serverPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'El directorio de backup debe estar dentro del proyecto del servidor.'
}
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$databaseName = [Environment]::GetEnvironmentVariable('DATABASE_NAME')
$backupFile = Join-Path $backupRoot "$databaseName-$timestamp.dump"
$env:PGPASSWORD = [Environment]::GetEnvironmentVariable('DATABASE_PASSWORD')
try {
    & pg_dump `
        --host ([Environment]::GetEnvironmentVariable('DATABASE_HOST')) `
        --port ([Environment]::GetEnvironmentVariable('DATABASE_PORT')) `
        --username ([Environment]::GetEnvironmentVariable('DATABASE_USER')) `
        --dbname $databaseName `
        --format custom `
        --no-owner `
        --file $backupFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con código $LASTEXITCODE." }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Output "Backup creado: $backupFile"
