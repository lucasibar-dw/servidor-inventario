param(
    [switch]$SkipBackup
)

$ErrorActionPreference = 'Stop'
$serverRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envFile = Join-Path $serverRoot '.env'

if (-not $SkipBackup) {
    & (Join-Path $PSScriptRoot 'backup-database.ps1')
}

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
        throw "Falta la variable $name para ejecutar las migraciones."
    }
}

$planningMigration = Join-Path $PSScriptRoot 'production_planning_v1.sql'
$env:PGPASSWORD = [Environment]::GetEnvironmentVariable('DATABASE_PASSWORD')
try {
    & psql `
        --host ([Environment]::GetEnvironmentVariable('DATABASE_HOST')) `
        --port ([Environment]::GetEnvironmentVariable('DATABASE_PORT')) `
        --username ([Environment]::GetEnvironmentVariable('DATABASE_USER')) `
        --dbname ([Environment]::GetEnvironmentVariable('DATABASE_NAME')) `
        --set ON_ERROR_STOP=1 `
        --file $planningMigration
    if ($LASTEXITCODE -ne 0) { throw "La migración de Producción terminó con código $LASTEXITCODE." }

    Push-Location $serverRoot
    try {
        & npm run migration:run
        if ($LASTEXITCODE -ne 0) { throw "TypeORM terminó con código $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Output 'Migraciones terminadas. Ya se puede publicar y reiniciar el backend.'
