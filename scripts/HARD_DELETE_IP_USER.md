# Hard-delete IP user (cascade)

Reusable helpers for wiping an Internship Portal account during domain-register / email testing so **no orphaned** internships, offers, messages, docs, etc. remain.

## Files

| Path | Role |
|---|---|
| [`lib/hardDeleteIpUser.js`](lib/hardDeleteIpUser.js) | Library: `hardDeleteIpUser`, `previewHardDeleteIpUser`, `findIpUser` |
| [`hard-delete-ip-user.js`](hard-delete-ip-user.js) | CLI wrapper |

## CLI

```bash
# Preview what would be removed
node scripts/hard-delete-ip-user.js --email=hr@acme.com --dry-run

# Actually delete (transactional)
node scripts/hard-delete-ip-user.js --email=hr@acme.com --confirm

# By user id
node scripts/hard-delete-ip-user.js --id=ip_user_xxx --confirm
```

Superadmin accounts are blocked unless `--allow-superadmin` is passed.

Uses `DATABASE_URL` from `.env.local` / `.env` (same as other portal scripts).

## Library reuse

```js
const { Client } = require('pg');
const { hardDeleteIpUser } = require('./lib/hardDeleteIpUser');

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const result = await hardDeleteIpUser(client, { email: 'hr@acme.com', dryRun: false });
await client.end();
```

## What gets removed

Explicit deletes inside one `BEGIN`/`COMMIT` (plus CASCADE-safe order):

- Messages & threads involving the user  
- Ratings, endorsements, viral shares, notifications, points ledger, password resets, login events  
- Employer: documents, LinkedIn promotions, offers, internships (apps/saved cascade), employer profile  
- Candidate: saved, applications, offers, candidate profile  
- Referrals (as referrer); referred_user_id cleared if they were referred  
- Manual employer requests matching that email  
- Finally `ip_users` row  

SET NULL FKs (e.g. feature idea author) are nulled or cleaned so addresses are not left hanging in a broken state for re-registration tests.
