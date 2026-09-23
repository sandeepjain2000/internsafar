/**
 * PlantUML for InternSafar employer "Complete company profile & documents" stage.
 *
 * PlantUML-safe rules:
 * - No swimlanes
 * - No ==partition== markers
 * - ASCII-only labels
 * - Balanced if/endif (self-checked)
 * - Each activity line ends with ;
 *
 * Usage:
 *   node scripts/generate-employer-complete-profile-flow-puml.mjs
 *
 * Output:
 *   docs/employer-complete-profile-flow.puml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "docs", "employer-complete-profile-flow.puml");

const lines = [
  "@startuml InternSafar_Employer_Complete_Profile",
  "title InternSafar - Employer complete company profile and documents\\n(/employer/profile)",
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
  ":Employer signs in\\n(email + password);",
  ":Open /employer/profile;",
  "",
  "note right",
  "  After register + email verify.",
  "  Approval badge may still be pending.",
  "  Posting also needs SuperAdmin approval",
  "  and verified email (posting gate).",
  "end note",
  "",
  ":GET /api/ip/employer/profile;",
  ":API requireSession(employer);",
  ":Load ip_employers + points /\\nprofile_complete / documents;",
  ":Return ethicsItems + ethicsVersion;",
  "",
  ":UI shows Employer profile\\n+ approval_status badge;",
  "",
  ":Company details section;",
  ":Fill company fields:\\nname, website, work email,\\nindustry, size, HQ location,\\ncontact, phone, entity type,\\nabout, LinkedIn, toggles;",
  "",
  "if (Upload company logo?) then (yes)",
  "  :POST /api/ip/employer/profile/logo/upload\\n(S3 image validate);",
  "  :Set logo_url on employer;",
  "else (skip logo)",
  "endif",
  "",
  ":Click Save company profile;",
  ":UI validate required phone;",
  ":PUT /api/ip/employer/profile;",
  "",
  ":API validate business_entity_type\\n+ required phone;",
  ":UPDATE editable employer fields;",
  "",
  "note right",
  "  REQUIRED_FOR_COMPLETE:",
  "  company_name, website, work_email,",
  "  industry, hq_city, contact_name,",
  "  contact_phone, business_entity_type",
  "  PLUS all Guidelines and Ethics boxes.",
  "  Documents are NOT required for",
  "  profile_complete flag.",
  "end note",
  "",
  ":Guidelines and Ethics section;",
  ":Show ethics checkboxes\\n(version 2026-08-08);",
  ":Employer checks all items;",
  ":Save ethics\\n(PUT profile with ethics_acks);",
  "",
  "if (All ethics checked?) then (yes)",
  "  :Set ethics_accepted_at = now();",
  "else (incomplete)",
  "  :ethics_accepted_at = null;",
  "endif",
  "",
  ":Recompute profile_complete\\n= required fields OK\\nAND all ethics checked;",
  ":UPDATE ip_users.profile_complete;",
  "",
  "if (profile_complete?) then (yes)",
  "  :UI: Profile saved - complete!;",
  "else (no)",
  "  :UI: missing company fields\\nand/or ethics incomplete;",
  "endif",
  "",
  ":Verification documents section;",
  ":Choose doc type:\\nShop Act / LLP / Business PAN / Other;",
  "",
  "if (Upload file to S3?) then (yes)",
  "  :POST /api/ip/employer/documents/upload\\n{ file, docType };",
  "  :INSERT ip_employer_documents;",
  "else (link form fallback)",
  "  :POST /api/ip/employer/documents\\n{ docType, fileName, url };",
  "  :INSERT ip_employer_documents;",
  "endif",
  "",
  ":Reload docs list on profile;",
  "",
  "note right",
  "  Uploaded docs appear for SuperAdmin",
  "  on Approvals Audit and Docs",
  "  and Documents queue. They do not",
  "  alone flip profile_complete.",
  "end note",
  "",
  ":Stage outcome;",
  "",
  "if (Ready to post later?) then (check gate)",
  "  :Posting gate needs:\\n1) profile_complete\\n2) approval_status=approved\\n3) email verified;",
  "else (keep editing)",
  "endif",
  "",
  ":Complete profile stage done;",
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
