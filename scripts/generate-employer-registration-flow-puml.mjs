/**
 * PlantUML for InternSafar employer "Register" stage only.
 *
 * Live UI: Domain-based or Free-email-based (no Google on this page).
 * Both paths: captcha + create pending employer + email verify + SuperAdmin approval.
 *
 * PlantUML-safe rules:
 * - No swimlanes
 * - No ==partition== markers
 * - ASCII-only labels
 * - Balanced if/endif (self-checked)
 * - Each activity line ends with ;
 *
 * Usage:
 *   node scripts/generate-employer-registration-flow-puml.mjs
 *
 * Output:
 *   docs/employer-registration-flow.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "docs", "employer-registration-flow.puml");

const lines = [
  "@startuml InternSafar_Employer_Registration",
  "title InternSafar - Employer registration\\n(/register/employer -> email verify -> SuperAdmin approval)",
  "",
  "skinparam shadowing false",
  "skinparam ActivityBackgroundColor #FFFFFF",
  "skinparam ActivityBorderColor #334155",
  "skinparam ActivityDiamondBackgroundColor #F8FAFC",
  "skinparam ActivityDiamondBorderColor #64748B",
  "skinparam ArrowColor #475569",
  "skinparam activityFontSize 12",
  "skinparam titleFontSize 14",
  "",
  "start",
  "",
  "if (Has referral link\\n/r/{code}?) then (yes)",
  "  :Open /r/{code};",
  "  :Redirect to\\n/register?ref={code};",
  "else (no)",
  "  :Open /register;",
  "endif",
  "",
  ":Show role chooser\\n(Candidate / Employer);",
  ":Choose Register as Employer;",
  ":Open /register/employer\\n(keep ?ref= if present);",
  "",
  "note right",
  "  Live UI has NO Google signup",
  "  on employer register.",
  "  Paths: Domain-based or Free-email-based.",
  "  Employer sets password on the form —",
  "  there is NO temporary-password email",
  "  (unlike candidate Google register).",
  "end note",
  "",
  ":Show path chooser:\\nDomain-based / Free-email-based;",
  "",
  "if (Choose Domain-based?) then (yes)",
  "  :Form: contact name, designation,\\ncompany, website, domain email,\\npassword (min 8), captcha;",
  "else (Free-email-based)",
  "  :Form: contact name, designation,\\ncompany, email, password (min 8),\\ncaptcha (no website required);",
  "endif",
  "",
  ":Submit Register as Employer;",
  ":POST /api/ip/auth/register-employer\\npath=domain or free_email;",
  "",
  ":Validate required fields\\n+ captcha;",
  "",
  "if (Validation failed?) then (yes)",
  "  :Return 400 with error;",
  "  stop",
  "else (ok)",
  "endif",
  "",
  "if (Email already exists?) then (yes)",
  "  :Return 409\\naccount already exists;",
  "  stop",
  "else (new email)",
  "endif",
  "",
  "if (path=domain?) then (yes)",
  "  :classifyEmployerEmail(email);",
  "  :May set softFail flag\\nfor SuperAdmin review;",
  "else (free_email)",
  "endif",
  "",
  ":BEGIN transaction;",
  ":Insert ip_users\\nrole=employer, points=50,\\nfree_post_credits=1,\\nemail_verify_required=true,\\nemail_verified_at=null;",
  ":Insert ip_employers\\napproval_status=pending\\n(+ softFail fields if any);",
  ":Insert points ledger +50;",
  "",
  "if (Valid referral code?) then (yes)",
  "  :Credit referrer + notify;",
  "else (no referral)",
  "endif",
  "",
  ":COMMIT;",
  "",
  ":Notify SuperAdmin\\nNew employer registered\\n(or review email if softFail);",
  "",
  ":Send email verification link\\n/register/employer/verify?token=...\\n(expires ~48 hours);",
  "",
  "if (Verify mail failed?) then (yes)",
  "  :Return ok with warning\\nverification email failed;",
  "else (sent)",
  "endif",
  "",
  ":Send ack email\\nregistration received / pending approval;",
  "",
  ":UI done screen:\\nCheck your email;",
  ":CTA Back to Sign In (/);",
  "",
  ":Employer opens verify link;",
  ":Open /register/employer/verify?token=...;",
  ":consumeEmployerEmailVerification;",
  "",
  "if (Token valid?) then (yes)",
  "  :Mark email verified;",
  "  :Show Email verified\\n(still need SuperAdmin approval);",
  "else (invalid / expired)",
  "  :Show Could not verify;",
  "endif",
  "",
  "note right",
  "  Sign-in and posting require",
  "  email verification AND",
  "  SuperAdmin approval of employer.",
  "  Profile/docs stage comes after.",
  "end note",
  "",
  ":Registration stage complete\\n(pending approval gate);",
  "stop",
  "",
  "@enduml",
  "",
];

const body = lines.join("\n");

function countMatches(re) {
  return (body.match(re) || []).length;
}

const checks = [
  { name: "has @startuml", ok: body.includes("@startuml") },
  { name: "has @enduml", ok: body.trimEnd().endsWith("@enduml") },
  { name: "no swimlanes", ok: !/^\s*\|[A-Za-z][^|]*\|\s*$/m.test(body) },
  { name: "no ==partition==", ok: !/^== .+ ==\s*$/m.test(body) },
  {
    name: "balanced if/endif",
    ok: countMatches(/^\s*if\s*\(/gm) === countMatches(/^\s*endif\s*$/gm),
  },
  { name: "no fancy dash", ok: !/[—–]/.test(body) },
  { name: "no fancy arrow", ok: !/[→←]/.test(body) },
  { name: "has start and stop", ok: /\bstart\b/.test(body) && /\bstop\b/.test(body) },
];

const activityLines = body.split("\n").filter((l) => {
  const t = l.trimStart();
  return t.startsWith(":") && !t.startsWith("::");
});
const badActivities = activityLines.filter((l) => !l.trimEnd().endsWith(";"));
checks.push({ name: "each activity ends with ;", ok: badActivities.length === 0 });

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error("PlantUML generator self-check failed:");
  for (const f of failed) console.error(`  - ${f.name}`);
  if (badActivities.length) {
    console.error("Bad activity lines:");
    badActivities.forEach((l) => console.error(`  ${l}`));
  }
  process.exit(1);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, body, "utf8");
console.log(`Wrote ${path.relative(root, outFile)}`);
console.log("Self-checks passed:", checks.map((c) => c.name).join(", "));
console.log(
  `if/endif: ${countMatches(/^\s*if\s*\(/gm)}/${countMatches(/^\s*endif\s*$/gm)}`,
);
