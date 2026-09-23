/**
 * PlantUML for InternSafar candidate "Track applications" stage only.
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
 *   node scripts/generate-candidate-track-applications-flow-puml.mjs
 *
 * Output:
 *   docs/candidate-track-applications-flow.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "docs", "candidate-track-applications-flow.puml");

const lines = [
  "@startuml InternSafar_Candidate_Track_Applications",
  "title InternSafar - Candidate track applications\\n(/candidate/applications)",
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
  ":Candidate opens\\n/candidate/applications;",
  "",
  "note right",
  "  Usually after a successful Apply",
  "  (redirect) or from candidate nav.",
  "  Messaging depth is Message stage;",
  "  Offers is a later stage.",
  "end note",
  "",
  ":UI restores list prefs\\n(tableKey candidate.applications);",
  "",
  ":GET /api/ip/candidate/applications\\n?pageSize=200;",
  ":API requireSession(candidate);",
  ":Resolve candidate id;",
  ":Query ip_applications\\njoined to internship + employer;",
  ":Decorate each row:\\ndisplay_status, status_tab,\\nnext_step, closed labels,\\nmasked company name;",
  ":Return items + total;",
  "",
  ":Also GET /api/ip/messages/threads;",
  ":Map internship_id -> thread id\\nfor Message buttons;",
  "",
  ":UI shows My Applications\\nmetrics + list/cards;",
  "",
  "if (Change tab / search / sort\\n/ column filters?) then (yes)",
  "  :Filter client-side:\\ntabs All / Applied / Under Review /\\nInterview / Offer / Rejected / Withdrawn;",
  "  :Search role or company;",
  "  :Sort latest / oldest /\\nstatus / match;",
  "  :Column filters:\\nrole, employer, stipend,\\nlocation, applied dates,\\nstatus, next step;",
  "  :Reset pager to page 1\\n(page size 10);",
  "else (keep current view)",
  "endif",
  "",
  "if (Open View Details?) then (yes)",
  "  :Show detail modal:\\ntitle, company, status,\\napplied date, next_step,\\nstipend, mode, location, match;",
  "  if (Open internship link?) then (yes)",
  "    :Go to\\n/candidate/internships/{id};",
  "  else (stay in modal)",
  "  endif",
  "else (no detail)",
  "endif",
  "",
  "if (Message employer?) then (yes)",
  "  if (Thread exists for posting?) then (yes)",
  "    :Go to\\n/candidate/messages/{threadId};",
  "  else (no thread yet)",
  "    :Go to /candidate/messages;",
  "  endif",
  "  :Handoff to Message stage;",
  "else (no message)",
  "endif",
  "",
  "if (Withdraw application?) then (yes)",
  "  note right",
  "    UI + API allow withdraw only when",
  "    status is applied or pending.",
  "  end note",
  "  if (Status is applied or pending?) then (no)",
  "    :UI hides Withdraw\\nor API rejects;",
  "  else (yes)",
  "    :PATCH /api/ip/candidate/applications/{id}\\n{ status: withdrawn };",
  "    :API requireSession(candidate);",
  "    :UPDATE status=withdrawn\\nonly if still applied/pending\\nand owned by candidate;",
  "    if (Update succeeded?) then (yes)",
  "      :Return ok;",
  "      :Close detail; reload list;",
  "    else (no)",
  "      if (Not found?) then (yes)",
  "        :Return 404;",
  "      else (already moved on)",
  "        :Return 409\\nalready withdrawn or\\nno longer withdrawable;",
  "      endif",
  "    endif",
  "  endif",
  "else (keep application)",
  "endif",
  "",
  "if (Browse more internships?) then (yes)",
  "  :Go to /candidate/internships;",
  "  stop",
  "else (stay on applications)",
  "  :Continue tracking\\nstatus and next steps;",
  "  stop",
  "endif",
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

const activityLines = body
  .split("\n")
  .filter((l) => {
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
