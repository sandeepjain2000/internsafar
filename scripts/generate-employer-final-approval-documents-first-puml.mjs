/**
 * PlantUML: Final Employer Approval requires Documents first.
 *
 * Product rule (assertDocumentsReadyForFinalApproval):
 *   - at least one document with review_status = approved
 *   - zero documents still pending
 * Employer uploads; SuperAdmin reviews in Documents; then Approvals.
 *
 * PlantUML-safe rules:
 * - No swimlanes
 * - No ==partition== markers
 * - ASCII-only labels (no em-dash / fancy arrows)
 * - Balanced if/endif (self-checked)
 * - Each activity line ends with ;
 * - Product flow only (no QA / PASS / FAIL wording)
 *
 * Usage:
 *   node scripts/generate-employer-final-approval-documents-first-puml.mjs
 *
 * Output:
 *   docs/employer-final-approval-documents-first.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "docs", "employer-final-approval-documents-first.puml");

const lines = [
  "@startuml InternSafar_Employer_Final_Approval_Documents_First",
  "title InternSafar - Final Employer Approval\\n(Documents must be approved first)",
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
  "note right",
  "  Live gate:",
  "  assertDocumentsReadyForFinalApproval",
  "  on employers/[id] PATCH.",
  "  Needs >=1 approved doc and",
  "  0 pending docs for that employer.",
  "end note",
  "",
  ":Employer registered\\n(Domain or Free-email);",
  ":Email verified;\\napproval_status = pending;",
  ":Employer can sign in\\nto upload documents;\\nPostings still locked;",
  "",
  ":SuperAdmin tries Final Approve\\nwith no documents uploaded;",
  "if (Documents ready?) then (no - zero uploads)",
  "  :Final Approval blocked;\\nEmployer must upload under\\nProfile and docs first;\\nNothing appears in Documents yet;",
  "endif",
  "",
  ":Employer uploads a\\nverification document;",
  ":Document stored as pending;\\nAppears on /superadmin/documents;",
  "",
  ":SuperAdmin tries Final Approve\\nwhile document is still pending;",
  "if (Documents ready?) then (no - pending exists)",
  "  :Final Approval blocked;\\nApprove the document in\\nthe Documents tab first;",
  "endif",
  "",
  ":SuperAdmin approves the document\\non /superadmin/documents;",
  ":Document review_status = approved;\\nAt least one approved;\\nzero pending;",
  "",
  ":SuperAdmin Final Approves employer\\non /superadmin/approvals;",
  "if (Documents ready?) then (yes)",
  "  :Set approval_status = approved;",
  "  :Notify employer;",
  "  :Postings unlock when email\\nis verified;",
  "endif",
  "",
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
  {
    name: "mentions documents-first gate",
    ok: /Documents ready\?/i.test(body) && /Final Approval blocked/i.test(body),
  },
  {
    name: "no QA meta wording",
    ok: !/\b(TEST FAIL|PASS step|Test step|UNEXPECTED|QA \/)\b/i.test(body),
  },
  {
    name: "covers upload then approve path",
    ok:
      /zero uploads/i.test(body) &&
      /pending exists/i.test(body) &&
      /review_status = approved/i.test(body) &&
      /approval_status = approved/i.test(body),
  },
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
