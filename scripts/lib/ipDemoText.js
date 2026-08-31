/**
 * Realistic demo text for seeded Internship Portal rows.
 *
 * Seeded data is shown to real reviewers in the employer and SuperAdmin lists,
 * so it must read like a live marketplace — never "Coverage role 3",
 * "QA Idea mt140t02xc0e", or twenty candidates from one invented college.
 *
 * Every helper is deterministic on the index so repeated runs and repair passes
 * agree, and titles stay unique past the end of the base pool.
 */

const { COMPANY_CATALOG, companyNameAt } = require('./ipCompanyCatalog.js');

const ROLES = [
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Android Developer',
  'iOS Developer', 'Data Analyst', 'Data Engineer', 'Machine Learning', 'UI/UX Design',
  'Graphic Design', 'Product Management', 'Business Analyst', 'Digital Marketing',
  'Content Writing', 'Social Media', 'SEO', 'Human Resources', 'Talent Acquisition',
  'Finance', 'Accounts', 'Operations', 'Supply Chain', 'Sales Development',
  'Business Development', 'Customer Success', 'Software Testing', 'QA Automation', 'DevOps', 'Cloud Support',
  'Cybersecurity', 'Technical Writing', 'Video Editing', 'Market Research',
  'Legal Compliance', 'Mechanical Design', 'Electronics Hardware',
];

const TEAMS = [
  'Platform', 'Growth', 'Core Product', 'Enterprise', 'Mobile', 'Analytics',
  'Payments', 'Infrastructure', 'Customer Experience', 'Innovation Lab',
];

// Company names live in one shared catalog — see ipCompanyCatalog.js for the rules.
const COMPANIES = COMPANY_CATALOG;

const COLLEGES = [
  'College of Engineering, Pune', 'Vishwakarma Institute of Technology, Pune',
  'MIT World Peace University, Pune', 'Pune Institute of Computer Technology',
  'Symbiosis Institute of Technology, Pune', 'VJTI, Mumbai',
  'K. J. Somaiya College of Engineering, Mumbai', 'Sardar Patel Institute of Technology, Mumbai',
  'VNIT, Nagpur', 'Government College of Engineering, Aurangabad',
  'Manipal Institute of Technology', 'BITS Pilani', 'SRM Institute of Science and Technology',
  'Amity University, Noida', 'Christ University, Bengaluru',
  'PES University, Bengaluru', 'Thapar Institute of Engineering and Technology',
  'Netaji Subhas University of Technology, Delhi',
];

const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Ananya', 'Arjun', 'Bhavya', 'Chirag', 'Devika', 'Dhruv',
  'Esha', 'Farhan', 'Gaurav', 'Harini', 'Ishaan', 'Jahnavi', 'Kabir', 'Kavya',
  'Lakshya', 'Meera', 'Nikhil', 'Ojas', 'Pooja', 'Rohan', 'Riya', 'Sahil',
  'Sneha', 'Tanvi', 'Uday', 'Varun', 'Yash', 'Zoya',
];

const LAST_NAMES = [
  'Sharma', 'Patil', 'Deshmukh', 'Iyer', 'Nair', 'Reddy', 'Gupta', 'Mehta',
  'Joshi', 'Kulkarni', 'Chatterjee', 'Bose', 'Rao', 'Menon', 'Bhat', 'Sethi',
];

const CITIES = ['Pune', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Nagpur', 'Chennai', 'Ahmedabad', 'Noida'];

const LIST_NAMES = [
  'Final round shortlist', 'Awaiting assignment submission', 'Strong portfolio — call this week',
  'Campus drive shortlist — Pune', 'Referred by team', 'High match, yet to screen',
  'Second interview scheduled', 'On hold — candidate reschedule', 'Fast track offers',
  'Backup pool', 'Needs manager review', 'Immediate joiners',
];

const REJECTION_TEMPLATES = [
  { name: 'Role filled internally', body: 'Thank you for applying. This role has been filled internally, so we are closing the opening for now.' },
  { name: 'Skills mismatch for this role', body: 'Thank you for your interest. The role needs deeper hands-on experience in the core skills listed, so we are not moving ahead this time.' },
  { name: 'Availability does not overlap', body: 'Thank you for applying. Your available start date does not overlap with the internship window for this batch.' },
  { name: 'Position on hold', body: 'Thank you for applying. This position is on hold for the current quarter. We will reach out if it reopens.' },
  { name: 'Assessment score below cutoff', body: 'Thank you for completing the assessment. Your score is below our cutoff for this role, so we are not proceeding further.' },
  { name: 'Portfolio did not meet the brief', body: 'Thank you for sharing your portfolio. The work submitted does not match the brief for this role.' },
  { name: 'Not enough project experience', body: 'Thank you for applying. We are looking for candidates with more project experience for this particular opening.' },
  { name: 'Prefer candidates in the posting city', body: 'Thank you for applying. This role requires presence in the posting city and we could not arrange relocation for interns.' },
  { name: 'Better fit for a future opening', body: 'Thank you for applying. Your profile is promising but fits a future opening better. We have kept it on file.' },
  { name: 'Duplicate application', body: 'We already have an active application from you for this role, so we are closing this duplicate entry.' },
  { name: 'Withdrew before interview', body: 'Closing this application as the candidate withdrew before the scheduled interview.' },
  { name: 'Screening questions incomplete', body: 'Thank you for applying. The mandatory screening questions were left incomplete, so we could not evaluate the application.' },
];

const NOTIFICATION_BODIES = {
  application: [
    'A new application arrived and is waiting in your pipeline.',
    'Three applications came in overnight for your open roles.',
    'An applicant matched above 85% on your posting requirements.',
    'A shortlisted candidate updated their CV.',
  ],
  interview: [
    'An interview slot was confirmed for tomorrow morning.',
    'A candidate requested a reschedule for the second round.',
    'Your interview panel feedback is pending submission.',
    'An interview was marked complete and awaits a decision.',
  ],
  message: [
    'A candidate replied to your query about the start date.',
    'You have an unread message on an active application.',
    'A candidate asked whether the role allows remote work.',
    'A conversation was reopened after an offer discussion.',
  ],
  offer: [
    'An offer was accepted by the candidate.',
    'An offer was declined; the seat is open again.',
    'An offer letter is nearing its validity date.',
    'A candidate asked for a revised joining date on an offer.',
  ],
  referral: [
    'Referral points were credited to your account.',
    'Someone joined using your referral link.',
    'Your referral milestone unlocked an extra posting credit.',
    'A referred candidate completed their profile.',
  ],
  system: [
    'A maintenance window is scheduled for this weekend.',
    'Your company documents were verified successfully.',
    'A new validation rule now applies to job postings.',
    'Your posting credits were refreshed for this month.',
  ],
};

const FEATURE_IDEAS = [
  { title: 'Bulk shortlist from the applicant table', description: 'Let recruiters select several applicants with checkboxes and move them all to a shortlist in one action instead of opening each row.' },
  { title: 'Save and reuse screening question sets', description: 'Allow employers to store a set of screening questions per role type and attach it to new postings.' },
  { title: 'Candidate-side application timeline', description: 'Show candidates a clear timeline of what happened to their application, including screening, interview, and decision stages.' },
  { title: 'Calendar sync for interview slots', description: 'Push confirmed interview slots to Google Calendar so both sides get reminders.' },
  { title: 'Duplicate posting detection', description: 'Warn an employer when a new posting closely matches one that is already live.' },
  { title: 'Stipend benchmarking hint', description: 'Show the median stipend for similar roles and cities while an employer is drafting a posting.' },
  { title: 'Resume keyword highlighting', description: 'Highlight the posting keywords inside the CV preview so recruiters can scan faster.' },
  { title: 'Offer letter templates', description: 'Provide reusable offer letter templates with merge fields for stipend, duration, and start date.' },
  { title: 'Withdraw with a reason', description: 'Ask candidates for an optional reason when they withdraw so employers can see patterns.' },
  { title: 'Weekly digest email for employers', description: 'Send one weekly summary of new applicants, pending interviews, and expiring offers instead of many alerts.' },
  { title: 'Accessibility pass on the application form', description: 'Audit the multi-step application form for keyboard navigation and screen reader labels.' },
  { title: 'Mobile filters as a bottom sheet', description: 'On phones, move the browse filters into a bottom sheet so results stay visible while filtering.' },
];

/** Candidate-facing wording; the pools above are written for employer eyes. */
const CANDIDATE_NOTIFICATION_BODIES = {
  application: [
    'Your application was received and is now under review.',
    'The employer moved your application to the shortlist.',
    'Your application status changed — open it for details.',
    'A recruiter viewed your profile for a role you applied to.',
  ],
  interview: [
    'Your interview is confirmed. Check the slot details.',
    'The employer proposed a new interview time.',
    'Your interview feedback has been recorded.',
    'A reminder: your interview is scheduled for tomorrow.',
  ],
  message: [
    'You have a new message from the employer.',
    'The employer replied to your question about the role.',
    'A recruiter asked about your available start date.',
    'You have an unread reply on your application thread.',
  ],
  offer: [
    'You received an internship offer. Review the terms.',
    'Your offer is awaiting your response.',
    'The employer revised your offer details.',
    'Your offer acceptance was recorded successfully.',
  ],
  referral: [
    'You earned points from a successful referral.',
    'A friend joined using your referral link.',
    'Your referral reward has been credited.',
    'You reached a new referral milestone.',
  ],
  system: [
    'Your profile is now visible to employers.',
    'Please verify your college email to boost your profile score.',
    'Your CV was uploaded successfully.',
    'A maintenance window is scheduled for this weekend.',
  ],
};

const MESSAGE_BODIES = [
  'Thanks for reaching out — I am available for a call this week.',
  'Could you share more detail on the day-to-day work for this role?',
  'I have attached my latest CV. Happy to answer any questions.',
  'That timeline works for me. I can start from the first of next month.',
  'Thank you for the update. I look forward to the next round.',
  'Yes, I am comfortable with a hybrid schedule from the Pune office.',
  'Noted on the assignment. I will submit it before the deadline.',
  'Appreciate the quick response. Please let me know the next step.',
];

const OFFER_MESSAGES = [
  'We are glad to extend this internship offer. Details are in the letter.',
  'Congratulations — your screening performance stood out to the panel.',
  'Welcome aboard, pending your acceptance. Reach out with any questions.',
  'Please review the terms and confirm before the validity date.',
];

const COMPLETION_NOTES = [
  'Internship completed successfully. Certificate issued.',
  'Completed the full duration with strong mentor feedback.',
  'Wrapped up all assigned deliverables on schedule.',
  'Completed; the team recommended the intern for a future role.',
];

const RATING_COMMENTS = [
  'Reliable work and clear communication throughout the internship.',
  'Picked up the codebase quickly and needed little supervision.',
  'Good attitude and consistent progress week to week.',
  'Delivered on time and asked thoughtful questions.',
];

const IDEA_PROBLEMS = [
  'Recruiters lose context when switching between tabs.',
  'Candidates cannot tell what stage their application is at.',
  'Sharing a shortlist with a hiring manager needs a spreadsheet today.',
  'Repeating the same screening questions for every posting wastes time.',
  'Good roles fill up before candidates notice them.',
];

const COHORTS = [
  'Spring cohort', 'Summer cohort', 'Monsoon batch', 'Autumn cohort', 'Winter batch',
  'Pune cohort', 'Mumbai cohort', 'Bengaluru cohort', 'Hyderabad batch', 'Evening batch',
];

const IDEA_COMMENTS = [
  'This would save real time during screening — we do it manually today.',
  'Agreed, but please keep an audit trail of who made the change.',
  'We would use this every week for campus drives.',
  'Useful, though it should respect the existing permission rules.',
  'Please make this optional; some teams prefer the current flow.',
  'This pairs well with the saved filter presets we already have.',
];

const pickFrom = (pool, i) => pool[((i % pool.length) + pool.length) % pool.length];

/** Unique, readable posting title; stays unique well past the role pool. */
function internshipTitle(i) {
  const role = pickFrom(ROLES, i);
  const cycle = Math.floor(i / ROLES.length);
  return cycle === 0 ? `${role} Intern` : `${role} Intern — ${pickFrom(TEAMS, cycle - 1)}`;
}

function internshipDescription(i) {
  const role = pickFrom(ROLES, i);
  const city = pickFrom(CITIES, i);
  return `Work with our ${pickFrom(TEAMS, i).toLowerCase()} team in ${city} on live ${role.toLowerCase()} work. `
    + 'You will own small features end to end, join weekly reviews, and get a mentor for the duration of the internship.';
}

function internshipRequirements(i) {
  const role = pickFrom(ROLES, i);
  return `Final-year or recent graduate. Comfortable with the fundamentals of ${role.toLowerCase()} work, `
    + 'able to commit to the full internship duration, and available for a weekly review call.';
}

/**
 * Company name by index, from the shared catalog so no two employer accounts can end up
 * displaying the same company — two accounts under one name make distinct postings read
 * as the same internship listed twice.
 */
function companyName(i) {
  return companyNameAt(i);
}

function personName(i) {
  return `${pickFrom(FIRST_NAMES, i)} ${pickFrom(LAST_NAMES, Math.floor(i / FIRST_NAMES.length) + i)}`;
}

const hashOf = (s) => [...String(s)].reduce((a, ch) => a + ch.charCodeAt(0), 0);

/**
 * Readable, run-specific qualifier — use instead of Date.now() or a random id
 * when a generated row needs to be distinguishable across runs.
 */
const runLabel = (run) => pickFrom(COHORTS, hashOf(run));

const college = (i) => pickFrom(COLLEGES, i);
const city = (i) => pickFrom(CITIES, i);
const listName = (i) => pickFrom(LIST_NAMES, i);
const rejectionTemplate = (i) => pickFrom(REJECTION_TEMPLATES, i);
/** role: 'candidate' gets candidate-facing wording, anything else employer/admin. */
function notificationBody(category, i, role = 'employer') {
  const table = role === 'candidate' ? CANDIDATE_NOTIFICATION_BODIES : NOTIFICATION_BODIES;
  return pickFrom(table[category] || table.system, i);
}

const messageBody = (i) => pickFrom(MESSAGE_BODIES, i);
const completionNote = (i) => pickFrom(COMPLETION_NOTES, i);
const ratingComment = (i) => pickFrom(RATING_COMMENTS, i);
const ideaProblem = (i) => pickFrom(IDEA_PROBLEMS, i);

/** Offer covering note, personalised the way the product does it. */
function offerMessage(i, firstName, roleTitle) {
  const who = firstName ? `Hi ${firstName}, ` : '';
  const role = roleTitle ? `for ${roleTitle} ` : '';
  return `${who}we would like to extend an offer ${role}with our team. ${pickFrom(OFFER_MESSAGES, i)}`;
}

/** Document file name derived from the document type the product offers. */
const documentFileName = (docType) =>
  `${String(docType || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
const IDEA_SCOPES = [
  '', ' — employer view', ' — candidate view', ' — mobile', ' — SuperAdmin view', ' — email digest',
];

/** Roadmap idea whose title stays distinct past the base pool. */
function featureIdea(i) {
  const base = pickFrom(FEATURE_IDEAS, i);
  const cycle = Math.floor(i / FEATURE_IDEAS.length);
  return { title: `${base.title}${pickFrom(IDEA_SCOPES, cycle)}`, description: base.description };
}
const ideaComment = (i) => pickFrom(IDEA_COMMENTS, i);

module.exports = {
  ROLES, TEAMS, COMPANIES, COLLEGES, CITIES, LIST_NAMES, REJECTION_TEMPLATES,
  NOTIFICATION_BODIES, CANDIDATE_NOTIFICATION_BODIES, FEATURE_IDEAS, IDEA_COMMENTS,
  MESSAGE_BODIES, OFFER_MESSAGES, COMPLETION_NOTES, RATING_COMMENTS, IDEA_PROBLEMS, COHORTS,
  internshipTitle, internshipDescription, internshipRequirements,
  companyName, personName, college, city, listName, rejectionTemplate,
  notificationBody, featureIdea, ideaComment, messageBody, completionNote,
  ratingComment, ideaProblem, offerMessage, documentFileName, runLabel,
};
