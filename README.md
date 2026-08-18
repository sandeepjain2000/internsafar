# internSafar (this PC)

This folder is a **stub** until the project is pushed from the other PC.

GitHub remote: https://github.com/sandeepjain2000/internsafar.git

Keep only:

- `README.md` (this file)
- `git-scripts\`
- `.gitignore` (file, not a folder)

Do **not** run `git-setup.bat` on this PC. That would create a second git history. The other PC does the first push.

## 1. Other PC (first upload)

1. Put the full project there (or your backup).
2. Copy `git-scripts` into that project.
3. Run `git-scripts\git-setup.bat`, then `git-scripts\git-push.bat`.
4. Open the GitHub link above and confirm the code files are visible.

## 2. This PC (after GitHub has the code)

1. Confirm GitHub is no longer empty.
2. Double-click `git-scripts\git-clone.bat`.

That downloads the project into this folder. `git-scripts` is kept even if the other PC did not upload it.

After that, use:

| Script | When |
|--------|------|
| `git-scripts\git-pull.bat` | Get latest from GitHub |
| `git-scripts\git-push.bat` | Upload your commits |

Do not use `git-setup.bat` on this PC after a successful clone.

## 3. Run the app (after clone)

```bash
npm install
npm run db:migrate:ip
npm run dev
```

Open http://localhost:3000

You need a `.env.local` (never commit it). Ask the other PC or your backup for those keys.
