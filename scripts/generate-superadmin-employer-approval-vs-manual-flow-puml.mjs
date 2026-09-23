/**
 * PlantUML clarifying SuperAdmin Employer Approvals vs Manual Requests.
 *
 * Usage:
 *   node scripts/generate-superadmin-employer-approval-vs-manual-flow-puml.mjs
 *
 * Output:
 *   docs/superadmin-employer-approval-vs-manual-flow.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(
  root,
  "docs",
  "superadmin-employer-approval-vs-manual-flow.puml",
);

const lines = [
  "@startuml InternSafar_SA_Employer_Approvals_vs_Manual",
  "title InternSafar - Employer Approvals vs Manual Requests\\n(two queues, two tables, different outcomes)",
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
  "  Confusion cleared:",
  "  Approvals = unlock an EXISTING employer account.",
  "  Manual Requests = CREATE an employer account",
  "  from a request row (no login yet).",
  "  Approving Manual does NOT send them",
  "  to Approvals Pending.",
  "end note",
  "",
  "if (How did the employer arrive?) then (Self-serve register\\n/register/employer)",
  "  :Employer chooses\\nDomain-based OR Free-email-based;",
  "  :POST /api/ip/auth/register-employer\\n(manualRequest=false);",
  "  :CREATE ip_users (employer);",
  "  :CREATE ip_employers\\napproval_status = pending;",
  "  :Send email verify link;",
  "  :Notify SuperAdmin\\nNew employer registered;",
  "",
  "  :Appears on\\n/superadmin/approvals\\n(Pending);",
  "",
  "  if (SuperAdmin decision?) then (Approve)",
  "    :Set approval_status = approved;",
  "    :Employer can post\\n(if profile complete + email verified);",
  "  else (Reject)",
  "    :Set approval_status = rejected;",
  "  endif",
  "",
  "  :Does NOT create\\nip_employer_requests row;",
  "  :Does NOT appear on\\nManual Requests Pending;",
  "",
  "else (Manual / legacy request\\nmanualRequest=true)",
  "  :Submit company + contact\\n(+ captcha) WITHOUT creating login;",
  "  :INSERT ip_employer_requests\\nstatus = pending;",
  "  :Notify SuperAdmin\\nManual employer request;",
  "",
  "  :Appears on\\n/superadmin/requests\\n(Pending);",
  "",
  "  if (SuperAdmin decision?) then (Approve and Create Account)",
  "    :CREATE ip_users + ip_employers\\napproval_status = approved\\n(already reviewed);",
  "    :Mark request status = approved;",
  "    :Email employer login ready;",
  "    :Skips Approvals Pending;",
  "    :May later show under\\nApprovals filter Approved\\n(same employer table);",
  "  else (Reject)",
  "    :Mark request status = rejected;",
  "    :No employer account created;",
  "  endif",
  "endif",
  "",
  "note right",
  "  Live UI today uses self-serve path",
  "  (Domain / Free-email) into Approvals.",
  "  Manual Requests remains for legacy /",
  "  API manualRequest submissions.",
  "end note",
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
