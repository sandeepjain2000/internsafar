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

git pull origin main
exit $LASTEXITCODE
