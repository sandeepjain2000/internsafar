# Package InternSafar for AWS — builds consolidated handoff folder.
# Usage: .\scripts\package-aws-deploy.ps1
# Output: ..\internship-portal-aws-handoff\ (zip + migrations + runner + docs)

& (Join-Path $PSScriptRoot 'build-aws-handoff.ps1')
