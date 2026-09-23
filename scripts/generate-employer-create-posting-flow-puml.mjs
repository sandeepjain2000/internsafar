/**
 * PlantUML for InternSafar employer "Create internship posting" stage.
 *
 * Live page: /employer/internships/new
 * Same form can Save as draft or Publish now (publish costs POINTS_PER_POST=50).
 *
 * PlantUML-safe rules:
 * - No swimlanes
 * - No ==partition== markers
 * - ASCII-only labels
 * - Balanced if/endif (self-checked)
 * - Each activity line ends with ;
 *
 * Usage:
 *   node scripts/generate-employer-create-posting-flow-puml.mjs
 *
 * Output:
 *   docs/employer-create-posting-flow.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "docs", "employer-create-posting-flow.puml");

const lines = [
  "@startuml InternSafar_Employer_Create_Posting",
  "title InternSafar - Employer create internship posting\\n(/employer/internships/new)",
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
  ":Employer opens\\n/employer/internships/new;",
  "",
  "note right",
  "  Posting gate (server-enforced):",
  "  1) profile_complete",
  "  2) approval_status = approved",
  "  3) email verified",
  "  Publish costs 50 points.",
  "  Draft costs 0 points.",
  "end note",
  "",
  ":UI loads degree catalog\\nGET /api/ip/ref/degrees;",
  ":UI loads city catalog;",
  "",
  ":Fill posting form tabs:\\ntitle, description, location/cities,\\nwork mode, stipend, duration,\\nstart/end dates, hours,\\neligibility skills/degrees,\\nscreening questions,\\napply window, reminders,\\nshow employer identity;",
  "",
  ":Optional candidate preview;",
  ":Quality checklist hints\\n(title, description,\\nlocation/remote, schedule);",
  "",
  "if (Duration vs start/end\\ndates mismatch?) then (yes)",
  "  :UI blocks submit\\nwith duration error;",
  "  stop",
  "else (ok)",
  "endif",
  "",
  "if (Action?) then (Save as draft)",
  "  :POST /api/ip/employer/internships\\nstatus=draft;",
  "else (Publish now)",
  "  :POST /api/ip/employer/internships\\nstatus=published;",
  "endif",
  "",
  ":API requireSession(employer);",
  ":getEmployerPostingGate(userId);",
  "",
  "if (Gate ok?) then (no)",
  "  :Return 403\\ncomplete profile /\\nawait approval /\\nverify email;",
  "  stop",
  "else (yes)",
  "endif",
  "",
  ":Require title;",
  ":validateScreeningQuestions;",
  "",
  "if (Question errors?) then (yes)",
  "  :Return 400;",
  "  stop",
  "else (ok)",
  "endif",
  "",
  ":validateScheduleFields\\n(startsAt / applyEndsAt);",
  "",
  "if (Schedule errors?) then (yes)",
  "  :Return 400;",
  "  stop",
  "else (ok)",
  "endif",
  "",
  "if (Publishing not draft?) then (yes)",
  "  :chargePublishPoints\\n(debit 50 if points >= 50);",
  "  if (Not enough points?) then (yes)",
  "    :Return 403\\nNeed 50 points... Or save as draft;",
  "    stop",
  "  else (charged)",
  "    :Insert points ledger\\nreason=posting_spend;",
  "  endif",
  "else (draft - no charge)",
  "endif",
  "",
  ":Check similar open titles\\n(duplicate warning only);",
  ":INSERT ip_internships\\nstatus=draft or published;",
  "",
  ":Return 201\\nid + pointsCharged\\n+ optional duplicateWarning;",
  "",
  ":UI may show duplicate warning;",
  ":Redirect to\\n/employer/internships;",
  "",
  ":Create posting stage complete;",
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
