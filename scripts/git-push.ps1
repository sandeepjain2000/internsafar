param(
    [Parameter(Position = 0)]
    [string]$Message = "Update intern safar"
)

$ErrorActionPreference = "Stop"

# scripts\ -> project root, regardless of current directory
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

if (-not (Test-Path ".git")) {
    Write-Host "Not a git repository. Run this from intern safar after git init."
    exit 1
}

Write-Host "Repo: $(git rev-parse --show-toplevel)"
Write-Host "Branch: $(git branch --show-current)"
Write-Host ""

git add -A

$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes to commit."
    exit 0
}

Write-Host "Changes to commit:"
git status --short
Write-Host ""

git commit -m $Message
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git push origin main
exit $LASTEXITCODE
