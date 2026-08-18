# Download internSafar into the project folder after the other PC has pushed.
# Keeps git-scripts even if they are not on GitHub.
#
# Usage:
#   .\git-clone.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

$RemoteUrl = "https://github.com/sandeepjain2000/internsafar.git"
$Branch = "main"

Write-Host "Working directory: $RepoRoot"
Write-Host "Checking $RemoteUrl ..."

$heads = git ls-remote --heads $RemoteUrl $Branch
if (-not $heads) {
    throw "GitHub has no '$Branch' branch yet. Push from the other PC first, then run git-clone.bat again."
}

$scriptsBackup = Join-Path $env:TEMP ("internsafar-git-scripts-" + [guid]::NewGuid().ToString())
Write-Host "Backing up git-scripts to $scriptsBackup"
Copy-Item -LiteralPath $PSScriptRoot -Destination $scriptsBackup -Recurse -Force

$localGit = Join-Path $RepoRoot ".git"
if (Test-Path -LiteralPath $localGit) {
    Write-Host "Removing existing .git in this project folder..."
    Remove-Item -LiteralPath $localGit -Recurse -Force
}

git init

$toplevel = (git rev-parse --show-toplevel).Replace('\', '/')
$here = $RepoRoot.Replace('\', '/')
if ($toplevel.TrimEnd('/') -ne $here.TrimEnd('/')) {
    throw "Git root is '$toplevel', not this project folder. Aborting so the parent repo is not used."
}

git remote add origin $RemoteUrl
git fetch origin $Branch
git checkout -f -B $Branch "origin/$Branch"

if (Test-Path -LiteralPath $scriptsBackup) {
    Write-Host "Restoring git-scripts..."
    New-Item -ItemType Directory -Force -Path $PSScriptRoot | Out-Null
    Copy-Item -Path (Join-Path $scriptsBackup "*") -Destination $PSScriptRoot -Recurse -Force
    Remove-Item -LiteralPath $scriptsBackup -Recurse -Force
}

Write-Host "Clone complete. This folder now matches origin/$Branch."
Write-Host "Use git-pull.bat / git-push.bat from now on. Do not run git-setup.bat on this PC."
