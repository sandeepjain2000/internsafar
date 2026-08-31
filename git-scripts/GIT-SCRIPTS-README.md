# Git scripts

Work on the **project folder** (parent of this directory), not inside `git-scripts`.

Remote: https://github.com/sandeepjain2000/internsafar.git

| File | Use |
|------|-----|
| `git-clone.bat` | This PC: download after the other PC has pushed. Safe if this folder still has README / git-scripts. |
| `git-setup.bat` | Other PC only: first-time `git init` + first commit. Do not run here if you are going to clone. |
| `git-push.bat` | Stage, commit if needed, push to `main`. |
| `git-pull.bat` | Pull `main` from GitHub. |

PowerShell equivalents: `git-clone.ps1`, `git-setup.ps1`, `git-push.ps1`, `git-pull.ps1`.
