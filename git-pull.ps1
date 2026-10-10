$ErrorActionPreference = "Stop"

# Script lives in the project root; run from there regardless of current directory
Set-Location $PSScriptRoot

if (-not (Test-Path ".git")) {
    Write-Host "Not a git repository. Run this from intern safar after git init."
    exit 1
}

Write-Host "Repo: $(git rev-parse --show-toplevel)"
Write-Host "Branch: $(git branch --show-current)"
Write-Host ""

git pull origin main
exit $LASTEXITCODE
