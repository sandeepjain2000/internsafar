# Build single AWS handoff folder: tar.gz app archive + migrations + runner + docs
# Usage: .\scripts\build-aws-handoff.ps1

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkspaceRoot = Split-Path -Parent $ProjectRoot
$HandoffRoot = Join-Path $WorkspaceRoot 'internship-portal-aws-handoff'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmm'
$ManifestSrc = Join-Path $PSScriptRoot 'MIGRATION_MANIFEST.txt'
$MigrationsSrc = Join-Path $ProjectRoot 'db\migrations'

$ExcludeDirNames = @(
    'node_modules', '.next', '.vercel', '.git', 'test-results', 'tmp-screenshots',
    '.local-qa-2fa-bypass-backup', '.cursor', 'coverage', 'playwright-report',
    '.turbo', 'out', 'build', '.netlify', '.cache', 'aws-migration'
)

$ExcludeFilePatterns = @(
    '.env', '.env.local', '.env.*.local', '.env.development.local', '.env.production.local',
    'client_secret*.json', '*.pem', '*.key', '*.p12', '*.pfx', '*.crt', '*.cer',
    'migrate-and-seed.mjs',
    '001_ism_schema.sql', '002_ism_portal_features.sql', '003_notifications_mailbox.sql',
    '004_audit_indexes.sql', '005_message_unread_student.sql'
)

function Test-ExcludedFile {
    param([string]$Name)
    foreach ($pat in $ExcludeFilePatterns) {
        if ($Name -like $pat) { return $true }
    }
    return $false
}

function Copy-ProjectFiltered {
    param([string]$Source, [string]$Dest)
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        $item = $_
        if ($item.PSIsContainer) {
            if ($ExcludeDirNames -contains $item.Name) { return }
            Copy-ProjectFiltered -Source $item.FullName -Dest (Join-Path $Dest $item.Name)
        } else {
            if (Test-ExcludedFile -Name $item.Name) { return }
            Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $Dest $item.Name) -Force
        }
    }
}

function Get-ManifestFiles {
    $lines = Get-Content -LiteralPath $ManifestSrc -Encoding UTF8
    $files = @()
    foreach ($line in $lines) {
        $t = $line.Trim()
        if ($t -and -not $t.StartsWith('#')) { $files += $t }
    }
    return $files
}

Write-Host "Handoff folder: $HandoffRoot"
if (Test-Path $HandoffRoot) { Remove-Item -LiteralPath $HandoffRoot -Recurse -Force }
New-Item -ItemType Directory -Path $HandoffRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $HandoffRoot 'migrations') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $HandoffRoot 'runner') -Force | Out-Null

# Docs at handoff root
$DocsSrc = Join-Path $PSScriptRoot 'aws-handoff-docs'
foreach ($name in @('SETUP-NOTES.txt', 'AWS-DEPLOY.md', 'DB-REFERENCE.md', 'ISSUES-FIXED.txt', 'PATH-B-NO-DB-MIGRATE.txt')) {
    $src = Join-Path $DocsSrc $name
    if (Test-Path $src) {
        Copy-Item -LiteralPath $src -Destination (Join-Path $HandoffRoot $name) -Force
    }
}

@'
InternSafar — DB scripts in the project tar (npm run from ~/internship-portal on EC2)
=====================================================================================

Migrations (require explicit allow — Path B must NOT set this):
  IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db     Fresh / empty RDS ONLY
  IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only     SQL 001–039 when demo users exist
  IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:ip           001 base schema only (specialist)
  IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:workbench    016–027 (specialist)
  npm run db:check-integrity                            Read-only (no allow needed)

Without IP_ALLOW_DB_MIGRATE=1, migrate prints === BLOCKED === and exits 1.
Why / how: PATH-B-NO-DB-MIGRATE.txt  |  Gate: scripts/assert-db-migrate-allowed.js

Path B (app code update): do NOT run any DB migrate/seed. Do NOT set IP_ALLOW_DB_MIGRATE.

Migration success: === OK === banners; === FAIL === / === BLOCKED === means stop (exit 1).

Reset / seed / delete (use with care on production; Path C seed is inside deploy:fresh-aws-db):
  IP_ALLOW_DB_MIGRATE=1 node scripts/IP_Reset_Core_Sample.js [--yes]   (prefer deploy:fresh-aws-db)
  npm run generate:ip-test-data                  Demo data generator
  npm run delete:ip-generated-run                Delete last generated QA run
  npm run delete:ip-except-cores                 Delete generated except core accounts
  node scripts/hard-delete-ip-user.js <email>    Hard-delete one user

Standalone runner (this handoff folder — SQL only; fresh RDS use app deploy:fresh-aws-db):
  cd runner && IP_ALLOW_DB_MIGRATE=1 NODE_PATH=~/internship-portal/node_modules node db_migrate_sql_only_ip.mjs
  (.env with DATABASE_URL in handoff root or EC2 app folder)
'@ | Set-Content -LiteralPath (Join-Path $HandoffRoot 'DB-SCRIPTS-REFERENCE.txt') -Encoding UTF8

# migrations/ — copy from manifest
$manifestFiles = Get-ManifestFiles
foreach ($f in $manifestFiles) {
    $src = Join-Path $MigrationsSrc $f
    if (-not (Test-Path $src)) { throw "Missing migration: $f" }
    Copy-Item -LiteralPath $src -Destination (Join-Path $HandoffRoot "migrations\$f") -Force
}
Write-Host "Copied $($manifestFiles.Count) migration SQL files"

# runner/
Copy-Item -LiteralPath $ManifestSrc -Destination (Join-Path $HandoffRoot 'runner\MIGRATION_MANIFEST.txt') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'db_exec_sql_file.js') -Destination (Join-Path $HandoffRoot 'runner\db_exec_sql_file.js') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'assert-db-migrate-allowed.js') -Destination (Join-Path $HandoffRoot 'runner\assert-db-migrate-allowed.js') -Force
Copy-Item -LiteralPath (Join-Path $DocsSrc 'db_migrate_sql_only_ip.mjs') -Destination (Join-Path $HandoffRoot 'runner\db_migrate_sql_only_ip.mjs') -Force

# README.txt is generated after the app tar exists (complete folder tree) — see end of script

# Project archive into handoff root (Linux-safe tar.gz only — no zip)
$StagingRoot = Join-Path $env:TEMP "ip-handoff-staging-$Timestamp"
$StagingApp = Join-Path $StagingRoot 'internship-portal'
Copy-ProjectFiltered -Source $ProjectRoot -Dest $StagingApp

# App folder structure (inside tar + copy at handoff root for visibility without untar)
$AppStructureScript = Join-Path $PSScriptRoot 'write-app-folder-structure.py'
$StagingStructure = Join-Path $StagingApp 'APP-FOLDER-STRUCTURE.txt'
python $AppStructureScript $StagingApp $StagingStructure
if ($LASTEXITCODE -ne 0) { throw "write-app-folder-structure.py failed" }
Copy-Item -LiteralPath $StagingStructure -Destination (Join-Path $HandoffRoot 'APP-TAR-FOLDER-STRUCTURE.txt') -Force

$ArchiveBase = Join-Path $HandoffRoot ("internship-portal-aws-deploy-$Timestamp")
$TarPath = "$ArchiveBase.tar.gz"
$ArchiveScript = Join-Path $PSScriptRoot 'linux-safe-archive.py'
if (Test-Path $TarPath) { Remove-Item -LiteralPath $TarPath -Force }
Write-Host "Creating Linux-safe tar.gz for app..."
python $ArchiveScript $StagingApp --tar $TarPath
if ($LASTEXITCODE -ne 0) { throw "linux-safe-archive.py failed with exit $LASTEXITCODE" }
Remove-Item -LiteralPath $StagingRoot -Recurse -Force

$tarMb = [math]::Round((Get-Item $TarPath).Length / 1MB, 2)
Write-Host "App tar: $TarPath ($tarMb MB)"

# README with complete folder structure (every file)
$ReadmeScript = Join-Path $PSScriptRoot 'write-handoff-readme.py'
python $ReadmeScript $HandoffRoot
if ($LASTEXITCODE -ne 0) { throw "write-handoff-readme.py failed" }

# Outer handoff zip (entire folder for sharing — Linux-safe; inner app is tar.gz only)
$OuterZip = Join-Path $WorkspaceRoot 'internship-portal-aws-handoff.zip'
if (Test-Path $OuterZip) { Remove-Item -LiteralPath $OuterZip -Force }
Write-Host "Creating outer handoff zip..."
python $ArchiveScript $HandoffRoot --zip $OuterZip
if ($LASTEXITCODE -ne 0) { throw "linux-safe-archive.py failed for outer bundle" }
$outerMb = [math]::Round((Get-Item $OuterZip).Length / 1MB, 2)
Write-Host "Done: $HandoffRoot"
Write-Host "Outer zip: $OuterZip ($outerMb MB)"
