/**
 * PlantUML for InternSafar employer "Publish posting" stage.
 *
 * Clarifies live behaviour:
 * - "Admin approval" = SuperAdmin must have approved the EMPLOYER account
 *   (posting gate). There is no per-posting SuperAdmin publish queue.
 * - Publish can happen at create (Publish now) or later (Activate Listing
 *   on draft/paused from /employer/internships).
 * - Transition to published (not already published) costs POINTS_PER_POST=50.
 *
 * PlantUML-safe rules:
 * - No swimlanes
 * - No ==partition== markers
 * - ASCII-only labels
 * - Balanced if/endif (self-checked)
 * - Each activity line ends with ;
 *
 * Usage:
 *   node scripts/generate-employer-publish-posting-flow-puml.mjs
 *
 * Output:
 *   docs/employer-publish-posting-flow.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "docs", "employer-publish-posting-flow.puml");

const lines = [
  "@startuml InternSafar_Employer_Publish_Posting",
  "title InternSafar - Employer publish posting\\n(draft/paused -> published)",
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
  "  Admin approval here means the EMPLOYER",
  "  account is approved by SuperAdmin.",
  "  Individual postings are NOT queued for",
  "  SuperAdmin to approve one-by-one.",
  "end note",
  "",
  "if (How is posting published?) then (At create)",
  "  :On /employer/internships/new\\nclick Publish now;",
  "  :POST /api/ip/employer/internships\\nstatus=published;",
  "  :getEmployerPostingGate;",
  "  if (Gate ok?) then (no)",
  "    :403: complete profile /\\nawait employer approval /\\nverify email;",
  "    stop",
  "  else (yes)",
  "  endif",
  "  :Validate title, questions, schedule;",
  "  :chargePublishPoints (50);",
  "  if (Enough points?) then (no)",
  "    :403 Need 50 points\\nOr save as draft;",
  "    stop",
  "  else (yes)",
  "  endif",
  "  :INSERT ip_internships\\nstatus=published;",
  "else (Later from list / edit)",
  "  :Employer has draft or paused\\nposting on /employer/internships;",
  "  :Click Activate Listing\\n(or save edit with status published);",
  "  :PUT /api/ip/employer/internships/{id}\\n{ status: published };",
  "  :Load owned internship;",
  "  if (Found and owned?) then (no)",
  "    :404 Not found;",
  "    stop",
  "  else (yes)",
  "  endif",
  "  if (Was already published?) then (yes)",
  "    :No new points charge;",
  "  else (draft or paused -> published)",
  "    :chargePublishPoints\\naction=republish (50);",
  "    if (Enough points?) then (no)",
  "      :403 Need 50 points;",
  "      stop",
  "    else (charged)",
  "      :Insert points ledger\\nreason=posting_spend;",
  "    endif",
  "  endif",
  "  :UPDATE status=published;",
  "endif",
  "",
  ":Posting is live in DB\\nstatus=published;",
  "",
  "note right",
  "  Candidates see it only when also:",
  "  starts_at is null or <= now",
  "  AND apply_ends_at is null or > now",
  "  (CANDIDATE_VISIBLE_SQL).",
  "end note",
  "",
  "if (Apply window open now?) then (yes)",
  "  :Appears in candidate browse;",
  "  :Employer can pause later\\nor promote on LinkedIn;",
  "else (scheduled / ended)",
  "  :Published but not yet\\n(or no longer) candidate-visible;",
  "endif",
  "",
  ":Redirect / stay on\\nemployer internships list;",
  ":Publish posting stage complete;",
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
