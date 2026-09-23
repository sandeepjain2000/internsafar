/**
 * PlantUML for InternSafar candidate "Apply" stage only.
 *
 * PlantUML-safe rules (avoid prior render bugs):
 * - No swimlanes
 * - No ==partition== markers
 * - No swimlane switches inside if/else
 * - ASCII-only labels (no em-dash / fancy arrows)
 * - One action per activity box; \n only inside :labels;
 * - Balanced if/endif (self-checked)
 *
 * Usage:
 *   node scripts/generate-candidate-apply-flow-puml.mjs
 *
 * Output:
 *   docs/candidate-apply-flow.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "docs", "candidate-apply-flow.puml");

const lines = [
  "@startuml InternSafar_Candidate_Apply",
  "title InternSafar - Candidate apply\\n(/candidate/internships/{id} -> POST applications)",
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
  ":Candidate is on posting detail\\n/candidate/internships/{id};",
  "",
  "note right",
  "  Starts after Browse opens the posting.",
  "  Cost: POINTS_PER_APPLICATION = 5 points.",
  "  Incomplete profile shows a tip but",
  "  does NOT block apply on the server.",
  "end note",
  "",
  ":UI already loaded:\\ninternship detail,\\nsaved state, points,\\nprofile_complete flag;",
  "",
  "if (Screening questions exist?) then (yes)",
  "  :Show questions\\n(text / textarea / MCQ);",
  "  :Candidate answers;",
  "  :Autosave answers draft\\nto localStorage\\nip_apply_draft_{id}\\n(~400ms debounce);",
  "else (no questions)",
  "endif",
  "",
  ":UI shows application cost\\n(5 points + wallet balance);",
  ":Candidate clicks Apply now;",
  "",
  "if (Required questions blank?) then (yes)",
  "  :UI error:\\nPlease answer all required\\nscreening questions...;",
  "  stop",
  "else (ok)",
  "endif",
  "",
  ":POST /api/ip/candidate/applications\\n{ internshipId, answers };",
  "",
  ":API requireSession(candidate);",
  ":Load ip_candidates row\\n(skills);",
  "",
  "if (Candidate profile missing?) then (yes)",
  "  :Return 404 Candidate profile missing;",
  "  stop",
  "else (ok)",
  "endif",
  "",
  ":Load internship\\n(status, schedule, questions);",
  "",
  "if (Posting still accessible?) then (no)",
  "  :Return 404\\nnot found or not open;",
  "  stop",
  "else (yes - published and window open)",
  "endif",
  "",
  ":Normalize + validate\\nscreening answers;",
  "",
  "if (Server required answers missing?) then (yes)",
  "  :Return 400\\nanswer required questions;",
  "  stop",
  "else (ok)",
  "endif",
  "",
  ":Evaluate screening disable\\n(auto-disable rules if any);",
  ":Snapshot questions for audit;",
  "",
  "if (Already applied\\nto this internship?) then (yes)",
  "  :Return 409\\nYou already applied...;",
  "  stop",
  "else (no duplicate)",
  "endif",
  "",
  ":Read candidate points balance;",
  "",
  "if (points < 5?) then (yes)",
  "  :Return 403\\nNeed 5 points to apply...;",
  "  stop",
  "else (enough points)",
  "endif",
  "",
  ":Compute match_score\\nfrom candidate skills vs\\nposting eligibility skills\\n(100 if no skill list);",
  "",
  ":withApplicationCapacityLock\\n(advisory lock on posting);",
  "",
  "if (Active apps >= 100\\non this posting?) then (yes)",
  "  :ROLLBACK + CAPACITY error;",
  "  :Return 409\\nmax 100 active applications;",
  "  stop",
  "else (capacity ok)",
  "endif",
  "",
  ":Deduct 5 points from ip_users;",
  ":Insert points ledger\\ndelta=-5 reason=application_spend;",
  ":Insert ip_applications\\nstatus=applied\\n+ answers + questions_snapshot\\n+ screening_disabled flags;",
  ":Insert ip_application_events\\nevent_type=applied;",
  ":COMMIT;",
  "",
  "if (This is first application\\nfor candidate?) then (yes)",
  "  :Maybe award first-application\\nbonus (+10 points once);",
  "else (not first)",
  "endif",
  "",
  ":Notify employer (in-app)\\nNew applicant;",
  ":Email employer\\n(best effort);",
  ":Notify candidate\\nApplication submitted;",
  "",
  ":Return 201 ok\\nid, matchScore,\\npayment.cost=5,\\npointsRemaining;",
  "",
  ":UI success message\\nApplied successfully!;",
  ":Clear apply draft\\nfrom localStorage;",
  ":Redirect to\\n/candidate/applications\\n(after ~1s);",
  "",
  ":Apply stage complete;",
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

// Stronger activity close check: every line starting with : must end with ;
const activityLines = body.split("\n").filter((l) => l.trimStart().startsWith(":") && !l.trimStart().startsWith("::"));
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
console.log(
  "Self-checks passed:",
  checks.map((c) => c.name).join(", "),
);
console.log(
  `if/endif: ${countMatches(/^\s*if\s*\(/gm)}/${countMatches(/^\s*endif\s*$/gm)}`,
);
