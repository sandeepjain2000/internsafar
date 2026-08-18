# Pull the latest commits for the project folder from internSafar.
#
# Usage:
#   .\git-pull.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

$RemoteUrl = "https://github.com/sandeepjain2000/internsafar.git"
$Branch = "main"

function Assert-ThisFolderOnly {
    $gitDir = Join-Path $RepoRoot ".git"
    if (-not (Test-Path -LiteralPath $gitDir)) {
        throw "No .git in the project folder. Run git-setup.bat first. Refusing to use a parent repo."
    }
    $toplevel = (git rev-parse --show-toplevel).Replace('\', '/')
    $here = $RepoRoot.Replace('\', '/')
    if ($toplevel.TrimEnd('/') -ne $here.TrimEnd('/')) {
        throw "Git root is '$toplevel', not this project folder. Aborting so the parent repo is not used."
    }
}

Assert-ThisFolderOnly

$existing = git remote 2>$null
if ($existing -match '(?m)^origin$') {
    git remote set-url origin $RemoteUrl
} else {
    git remote add origin $RemoteUrl
}

git pull origin $Branch
Write-Host "Pulled origin/$Branch ($RemoteUrl)"
