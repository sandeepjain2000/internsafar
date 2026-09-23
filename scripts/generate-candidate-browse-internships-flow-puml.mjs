/**
 * PlantUML for InternSafar candidate "Browse internships" stage only.
 *
 * PlantUML-safe rules (avoid prior render bugs):
 * - No swimlanes
 * - No ==partition== markers
 * - No swimlane switches inside if/else
 * - ASCII-only labels (no em-dash / fancy arrows)
 * - One action per activity box; \n only inside :labels;
 *
 * Usage:
 *   node scripts/generate-candidate-browse-internships-flow-puml.mjs
 *
 * Output:
 *   docs/candidate-browse-internships-flow.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "docs", "candidate-browse-internships-flow.puml");

function activity(text) {
  return `:${text};`;
}

const lines = [
  "@startuml InternSafar_Candidate_Browse_Internships",
  "title InternSafar - Candidate browse internships\\n(/candidate/internships -> open posting)",
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
  activity("Candidate signs in\\n(email + password)"),
  activity("Open /candidate/internships"),
  "",
  "note right",
  "  Requires candidate session.",
  "  Apply submit is the NEXT stage;",
  "  this stage ends at open detail.",
  "end note",
  "",
  activity("UI restores list prefs\\n(tableKey candidate.internships)"),
  activity("UI may set tab=saved\\nif URL has ?saved=1"),
  activity("GET /api/ip/candidate/profile\\n(show points wallet)"),
  "",
  activity("Build query params from UI:\\nq, workMode, minStipend / unpaid,\\nmaxDuration, startDate,\\nregion, location (cities),\\nminMatch, minValidation,\\nsort, savedOnly, chip"),
  "",
  activity("GET /api/ip/candidate/internships?params"),
  "",
  activity("API requireSession(candidate)"),
  activity("Load candidate skills\\nfor match scoring"),
  activity("Query published internships\\nvisible now:\\nstatus=published AND\\nstarts_at ok AND\\napply_ends_at not passed\\nLIMIT 200"),
  activity("Join employers + app counts"),
  activity("Load employer documents\\nfor validation score"),
  activity("Load saved + applied ids\\nfor this candidate"),
  "",
  activity("For each posting compute:\\nmatch_score (skills vs eligibility)\\nvalidation_score\\nmasked company name\\nsaved / applied flags\\napplication_volume_label\\n(if employer shows hiring numbers)"),
  "",
  activity("Apply filters in memory:\\nsearch q, stipend, duration,\\nwork mode, start date,\\ncity / region, min match,\\nmin validation, chips"),
  activity("Sort (best-match, stipend,\\nnewest, earliest-start,\\nfewest-applicants)"),
  activity("Return items + counts\\n(all / saved / recommended)"),
  "",
  activity("UI shows list\\n(cards or table view)\\nclient page size 10"),
  "",
  "if (Change search / filters\\n/ sort / tab / chip?) then (yes)",
  "  :Debounce search (~250ms)\\nthen reload list;",
  "  :Reset pager to page 1;",
  "else (keep current list)",
  "endif",
  "",
  "if (Use quick chip?) then (yes)",
  "  :Chip options:\\nAll / Starting soon / Saved /\\nRecently updated /\\nVerified employers;",
  "  :Reload with chip=...;",
  "else (no chip)",
  "endif",
  "",
  "if (Switch tab?) then (yes)",
  "  :Tabs: All / Saved / Recommended;",
  "  :Saved -> savedOnly=1;",
  "  :Recommended -> minMatch at least 85;",
  "  :Reload list;",
  "else (stay on tab)",
  "endif",
  "",
  "if (Toggle bookmark on a card?) then (yes)",
  "  :POST /api/ip/candidate/saved\\n{ internshipId, saved };",
  "  :Reload list;",
  "else (no save change)",
  "endif",
  "",
  "if (Open a posting?) then (yes)",
  "  :Navigate to\\n/candidate/internships/{id};",
  "  :GET /api/ip/candidate/internships/{id};",
  "  if (Posting still visible?) then (yes)",
  "    :Show detail page\\n(title, company, stipend,\\nvalidation, questions preview);",
  "    :Also load saved state\\nand profile_complete / points;",
    "    :Browse stage complete;",
    "    :Ready for Apply stage\\n(next diagram);",
  "    stop",
  "  else (not available)",
  "    :Show not found / unavailable;",
  "    stop",
  "  endif",
  "else (keep browsing)",
  "  :Page with IpListPager\\nor refine filters;",
  "  stop",
  "endif",
  "",
  "@enduml",
  "",
];

// Basic self-checks before write (catch generator bugs early)
const body = lines.join("\n");
const checks = [
  { name: "has @startuml", ok: body.includes("@startuml") },
  { name: "has @enduml", ok: body.includes("@enduml") },
  { name: "no swimlanes", ok: !/^\|[A-Za-z].*\|$/m.test(body) },
  { name: "no ==partition==", ok: !/^== .+ ==$/m.test(body) },
  { name: "balanced if/endif", ok: (body.match(/\bif\s*\(/g) || []).length === (body.match(/\bendif\b/g) || []).length },
  { name: "no fancy dash", ok: !/[—–]/.test(body) },
  { name: "no fancy arrow", ok: !/[→←]/.test(body) },
];

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error("PlantUML generator self-check failed:");
  for (const f of failed) console.error(`  - ${f.name}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, body, "utf8");
console.log(`Wrote ${path.relative(root, outFile)}`);
console.log("Self-checks passed:", checks.map((c) => c.name).join(", "));
