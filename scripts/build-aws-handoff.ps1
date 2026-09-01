# Build single AWS handoff folder: zip + migrations copy + runner + docs
# Usage: .\scripts\build-aws-handoff.ps1

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkspaceRoot = Split-Path -Parent $ProjectRoot
$HandoffRoot = Join-Path $WorkspaceRoot 'internship-portal-aws-handoff'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmm'
$ZipName = "internship-portal-aws-deploy-$Timestamp.zip"
$ManifestSrc = Join-Path $PSScriptRoot 'MIGRATION_MANIFEST.txt'
$MigrationsSrc = Join-Path $ProjectRoot 'db\migrations'

$ExcludeDirNames = @(
    'node_modules', '.next', '.vercel', '.git', 'test-results', 'tmp-screenshots',
    '.local-qa-2fa-bypass-backup', '.cursor', 'coverage', 'playwright-report',
    '.turbo', 'out', 'build', '.netlify', '.cache', 'aws-migration'
)

$ExcludeFilePatterns = @(
    '.env', '.env.local', '.env.*.local', '.env.development.local', '.env.production.local',
    'client_secret*.json', '*.pem', '*.key', '*.p12', '*.pfx', '*.crt', '*.cer'
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
foreach ($name in @('SETUP-NOTES.txt', 'AWS-DEPLOY.md', 'DB-REFERENCE.md')) {
    $src = Join-Path $DocsSrc $name
    if (Test-Path $src) {
        Copy-Item -LiteralPath $src -Destination (Join-Path $HandoffRoot $name) -Force
    }
}

@'
InternSafar — DB scripts in the project zip (npm run from ~/internship-portal on EC2)
=====================================================================================

Migrations:
  npm run db:migrate:all          All IP SQL files 001–038 in order
  npm run db:migrate:ip           001 base schema only
  npm run db:migrate:workbench    016–027
  npm run db:check-integrity      Read-only FK/pipeline/browse checks (no writes)

Reset / seed / delete (use with care on production):
  node scripts/IP_Reset_Core_Sample.js [--yes]   Core demo reset + re-seed
  npm run generate:ip-test-data                  Demo data generator
  npm run delete:ip-generated-run                Delete last generated QA run
  npm run delete:ip-except-cores                 Delete generated except core accounts
  node scripts/hard-delete-ip-user.js <email>    Hard-delete one user

Standalone runner (this handoff folder, optional):
  cd runner && node db_migrate_all_ip.mjs
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

$handoffMigrateAll = @'
#!/usr/bin/env node
/**
 * Run all IP migrations from ../migrations/ (handoff bundle).
 * Usage (from runner/): node db_migrate_all_ip.mjs
 * Requires DATABASE_URL in .env (cwd = handoff root or extracted app on EC2).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handoffRoot = path.join(__dirname, '..');
const migrationsDir = path.join(handoffRoot, 'migrations');
const manifestPath = path.join(__dirname, 'MIGRATION_MANIFEST.txt');
const runner = path.join(__dirname, 'db_exec_sql_file.js');

function loadManifest() {
  const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/);
  return lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function main() {
  const files = loadManifest();
  console.log(`Handoff migrate-all: ${files.length} files from migrations/`);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const abs = path.join(migrationsDir, file);
    if (!fs.existsSync(abs)) {
      console.error(`Missing: ${abs}`);
      process.exit(1);
    }
    console.log(`\n[${i + 1}/${files.length}] ${file}`);
    const result = spawnSync(process.execPath, [runner, abs], {
      cwd: handoffRoot,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) {
      console.error(`\nFailed at ${file}`);
      process.exit(result.status ?? 1);
    }
  }
  console.log(`\nAll ${files.length} migrations completed.`);
}

main();
'@
Set-Content -LiteralPath (Join-Path $HandoffRoot 'runner\db_migrate_all_ip.mjs') -Value $handoffMigrateAll -Encoding UTF8

# db_exec_sql_file.js in handoff accepts absolute paths
$handoffExec = Get-Content -LiteralPath (Join-Path $HandoffRoot 'runner\db_exec_sql_file.js') -Raw
$handoffExec = $handoffExec -replace 'const sqlPath = path.join\(process.cwd\(\), rel\);', @'
const sqlPath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
'@
Set-Content -LiteralPath (Join-Path $HandoffRoot 'runner\db_exec_sql_file.js') -Value $handoffExec -Encoding UTF8 -NoNewline

@'
InternSafar — AWS handoff bundle (one folder)
============================================

Contents:
  internship-portal-aws-deploy-*.zip  — full app source (extract on EC2 to ~/internship-portal)
  migrations/                         — copy of all IP SQL migrations (001–038)
  runner/                             — run migrations standalone OR use npm in extracted app
  SETUP-NOTES.txt, AWS-DEPLOY.md, DB-REFERENCE.md

On EC2 (recommended — uses app + npm):
  1. Extract zip to ~/internship-portal
  2. Create .env with RDS DATABASE_URL + secrets (never upload local .env.local)
  3. cd ~/internship-portal && npm install --legacy-peer-deps
  4. npm run db:migrate:all
  5. npm run build && pm2 start npm --name internsafar -- start

Standalone runner (optional — from this folder, needs: npm install pg in runner/ or use extracted app node_modules):
  cd runner
  node db_migrate_all_ip.mjs
  (put .env with DATABASE_URL in internship-portal-aws-handoff/ root)

Full AWS steps: InternSafar_AWS_Deployment_Runbook_CRISP_COMPLETE_FINAL (1).docx (workspace root)
'@ | Set-Content -LiteralPath (Join-Path $HandoffRoot 'README.txt') -Encoding UTF8

# Project zip into handoff root
$StagingRoot = Join-Path $env:TEMP "ip-handoff-staging-$Timestamp"
$StagingApp = Join-Path $StagingRoot 'internship-portal'
Copy-ProjectFiltered -Source $ProjectRoot -Dest $StagingApp
$ZipPath = Join-Path $HandoffRoot $ZipName
if (Test-Path $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
Write-Host "Creating zip: $ZipPath"
Compress-Archive -Path $StagingApp -DestinationPath $ZipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $StagingRoot -Recurse -Force

$sizeMb = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Host "Inner app zip: $ZipPath ($sizeMb MB)"

# Outer handoff zip (entire folder for sharing)
$OuterZip = Join-Path $WorkspaceRoot 'internship-portal-aws-handoff.zip'
if (Test-Path $OuterZip) { Remove-Item -LiteralPath $OuterZip -Force }
Write-Host "Creating outer zip: $OuterZip"
Compress-Archive -Path $HandoffRoot -DestinationPath $OuterZip -CompressionLevel Optimal
$outerMb = [math]::Round((Get-Item $OuterZip).Length / 1MB, 2)
Write-Host "Done: $HandoffRoot"
Write-Host "Outer: $OuterZip ($outerMb MB)"
Write-Host $HandoffRoot
