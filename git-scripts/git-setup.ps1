# Initialize the project folder as its own git repo and point it at internSafar.
# Removes a local .git in the project root only (never the parent CampusPlacement repo).
#
# Usage:
#   .\git-setup.ps1
#   .\git-setup.ps1 -Push
#   .\git-setup.ps1 -NoCommit

param(
    [switch]$Push,
    [switch]$NoCommit
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

$RemoteUrl = "https://github.com/sandeepjain2000/internsafar.git"
$Branch = "main"

function Assert-ThisFolderOnly {
    $gitDir = Join-Path $RepoRoot ".git"
    if (-not (Test-Path -LiteralPath $gitDir)) {
        throw "No .git in the project folder. Run git-setup.ps1 first. Refusing to use a parent repo."
    }
    $toplevel = (git rev-parse --show-toplevel).Replace('\', '/')
    $here = $RepoRoot.Replace('\', '/')
    if ($toplevel.TrimEnd('/') -ne $here.TrimEnd('/')) {
        throw "Git root is '$toplevel', not this project folder. Aborting so the parent repo is not used."
    }
}

Write-Host "Working directory: $RepoRoot"

$localGit = Join-Path $RepoRoot ".git"
if (Test-Path -LiteralPath $localGit) {
    Write-Host "Removing existing .git in this project folder..."
    Remove-Item -LiteralPath $localGit -Recurse -Force
} else {
    Write-Host "No .git in this project folder (parent CampusPlacement git is left untouched)."
}

git init
Assert-ThisFolderOnly

$readme = Join-Path $RepoRoot "README.md"
if (-not (Test-Path -LiteralPath $readme)) {
    Set-Content -LiteralPath $readme -Value "# internsafar`n" -Encoding utf8
}

if (-not $NoCommit) {
    git add -A
    $pending = git status --porcelain
    if ($pending) {
        git commit -m "first commit"
    } else {
        Write-Host "Nothing to commit."
    }
}

git branch -M $Branch

$existing = git remote 2>$null
if ($existing -match '(?m)^origin$') {
    git remote set-url origin $RemoteUrl
} else {
    git remote add origin $RemoteUrl
}

Write-Host "Remote origin: $RemoteUrl"
git remote -v

if ($Push) {
    git push -u origin $Branch
    Write-Host "Setup complete and pushed to origin/$Branch."
} else {
    Write-Host "Setup complete. Run git-push.bat (or .\git-push.ps1) to upload."
}
