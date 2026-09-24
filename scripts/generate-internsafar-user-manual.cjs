/**
 * Generates InternSafar User Manual (.docx) for upload to Google Docs.
 * Run from repo: node scripts/generate-internsafar-user-manual.mjs
 */
const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, BorderStyle, AlignmentType, PageNumber, Footer, Header, PageBreak } = require('C:/Users/place/Work/UIUX Migration/.agents/skills/docx/node_modules/docx');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'InternSafar-User-Manual.docx');

const brand = '1E3A8A';
const muted = '475569';

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, color: brand })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: brand })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, color: '0F172A' })],
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, color: muted, size: 22, ...opts })],
  });
}
function boldLead(lead, rest) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: lead, bold: true, color: '0F172A', size: 22 }),
      new TextRun({ text: rest, color: muted, size: 22 }),
    ],
  });
}
function note(text) {
  return new Paragraph({
    spacing: { before: 80, after: 160 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: '4F46E5', space: 8 },
    },
    indent: { left: 120 },
    children: [new TextRun({ text, italics: true, color: muted, size: 20 })],
  });
}
function bullet(text, ref = 'bullets') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, color: muted, size: 22 })],
  });
}
function step(text) {
  return new Paragraph({
    numbering: { reference: 'steps', level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, color: muted, size: 22 })],
  });
}

const children = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'InternSafar', bold: true, size: 56, color: brand })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'User Manual', size: 36, color: '0F172A' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: 'Internship marketplace — Candidate · Employer · SuperAdmin',
        size: 20,
        color: muted,
        italics: true,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [
      new TextRun({
        text: `Version dated ${new Date().toISOString().slice(0, 10)}  ·  Based on the live InternSafar product`,
        size: 18,
        color: '64748B',
      }),
    ],
  }),

  h1('1. What is InternSafar?'),
  p('InternSafar is an internship marketplace where candidates discover and apply to internships, employers post roles and manage applicants, and SuperAdmin oversees approvals and platform health.'),
  bullet('Candidates browse published internships, apply with points, message employers, and manage offers.'),
  bullet('Employers complete a company profile, get approved, publish listings (using points), and hire through a workbench.'),
  bullet('SuperAdmin approves employers, reviews documents, and moderates postings.'),
  note('Public marketing pages also include Help, How it works, Guidelines, and Feature ideas. Sign-in for all roles is email and password on the home page.'),

  h1('2. Getting started'),
  h2('2.1 Where to sign in'),
  bullet('Open the InternSafar home page (for example https://internsafar.com or your organisation’s preview URL).'),
  bullet('Sign in with email and password. Google is used for registration verification only — not for day-to-day login.'),
  bullet('After sign-in you land on your role home: Candidate, Employer, or SuperAdmin.'),
  bullet('Forgot password: use Forgot password on the sign-in flow. Account security and optional 2FA live under Account after you are signed in.'),
  note('Bookmarks to /superadmin/login redirect to the same home sign-in page.'),

  h2('2.2 Create an account'),
  h3('Candidates'),
  step('Go to Register → Candidate (or /register/candidate).'),
  step('Verify with Google using a personal @gmail.com / @googlemail.com address.'),
  step('Complete the registration form. A temporary password is emailed; sign in with email and password, then change the password under Account.'),
  step('New candidates receive a starting points balance (see Points below).'),

  h3('Employers'),
  step('Go to Register → Employer (or /register/employer).'),
  step('Provide company details (including business entity type) and follow the verification path shown on the form.'),
  step('Sign in with the password you set (employers use the form password — not a temporary password email).'),
  step('Complete Profile & docs, upload verification documents if asked, and wait for SuperAdmin approval before publishing.'),
  step('New employers receive a starting points balance (see Points below).'),

  h2('2.3 Referral links'),
  p('If someone shared a referral link (/r/CODE or a register link with ?ref=), open it before registering. Invalid codes are ignored; a valid code can credit the referrer after you complete signup (and any approval rules that apply).'),

  h1('3. Reward points (how the economy works)'),
  p('InternSafar uses reward points — not cash — for applying and publishing.'),
  boldLead('New account gift: ', 'Both new candidates and new employers receive 50 points at signup (recorded as a default signup credit).'),
  boldLead('Apply cost (candidates): ', '5 points per application.'),
  boldLead('Publish cost (employers): ', '50 points each time you publish or re-publish an internship. Drafts do not charge points.'),
  boldLead('Earn more: ', 'Referrals (typically +25 points when a referred signup completes the product rules), LinkedIn promo rewards, viral / share programmes, and other bonuses shown in Refer & earn.'),
  note('Practical meaning: a new employer’s signup gift covers one publish. A new candidate’s 50 points cover up to 10 applications at 5 points each (before other bonuses or spends). If you see “Need 50 points to publish (you have 0)”, save as draft or earn more points — the balance is empty.'),

  h1('4. Candidate guide'),
  h2('4.1 Menu (left sidebar)'),
  bullet('Dashboard — welcome, stats, readiness, recommendations.'),
  bullet('Profile — basics, academics, skills, work readiness, privacy, photo, endorsements.'),
  bullet('Browse internships — search, filter, save, open details, apply.'),
  bullet('My applications — track status, withdraw when allowed.'),
  bullet('Messages — reply to employer threads.'),
  bullet('Offers — accept or decline pending offers.'),
  bullet('Refer & earn — share your link and see points history.'),
  bullet('Notifications — in-app alerts; Mark all as read when needed.'),
  bullet('Feature ideas — suggest product improvements.'),
  bullet('Account — password, 2FA, notification preferences, sessions.'),

  h2('4.2 Complete your profile'),
  step('Open Profile and fill Basics & Contact, Academic & Skills, and Work Readiness.'),
  step('Upload a resume when prompted; keep contact details accurate.'),
  step('Save as you go. Profile completeness unlocks a better experience; an incomplete profile may show warnings but apply rules are enforced by the server.'),
  note('Phone may stay hidden from employers until you reach interview / offer / hired stages, depending on privacy settings.'),

  h2('4.3 Browse and apply'),
  step('Open Browse internships. Use tabs (All / Saved / Recommended) and filters (work mode, stipend, region, city, match, and more).'),
  step('Open a role → Review & Apply. Confirm you have at least 5 points.'),
  step('Answer screening questions if shown, then submit.'),
  step('You cannot apply twice to the same posting. If points are insufficient, earn more via Refer & earn before retrying.'),
  note('Some employers hide their brand (“Confidential employer”) or hiring volume. That is intentional.'),

  h2('4.4 Applications, messages, offers'),
  bullet('My applications shows pipeline statuses (applied, under review, interview, offer, rejected, withdrawn, and related labels).'),
  bullet('Withdraw only when the product allows it for your current status.'),
  bullet('Messages: employers usually start threads; you reply. Attachments may include PDF and common image types.'),
  bullet('Offers: Accept or Decline while pending and not expired. Accepted offers can show onboarding / contact details.'),

  h2('4.5 Notifications and referrals'),
  bullet('Notifications list in-app events. Use filters and Mark all as read as needed.'),
  bullet('Refer & earn shows your share link and points ledger. Sharing alone does not credit points — successful referred registrations do (per product rules).'),

  h1('5. Employer guide'),
  h2('5.1 Menu (left sidebar)'),
  bullet('Dashboard — overview of postings and activity.'),
  bullet('Profile & docs — company details, ethics acknowledgements, verification documents.'),
  bullet('Postings — create, edit, pause, and manage internship listings.'),
  bullet('Search candidates — find and open candidate profiles / workbench paths.'),
  bullet('Messages, Offers, Analytics, Rejection templates.'),
  bullet('Refer & earn, Notifications, Feature ideas, Account.'),

  h2('5.2 Before you can publish'),
  p('Publishing is blocked until these are true:'),
  bullet('Profile complete — required company fields (marked with *) plus all Guidelines & Ethics checkboxes.'),
  bullet('Account approved by SuperAdmin (status Approved on your profile).'),
  bullet('Enough points — 50 points for each publish / re-publish (or save as Draft without charging).'),
  note('Required profile fields typically include: company / legal name, business entity type, website, industry, HQ city, primary contact, contact phone, and work email — plus ethics acknowledgements.'),

  h2('5.3 Profile & documents'),
  step('Open Profile & docs.'),
  step('Fill Company Details, Contact & Location, About & Visibility.'),
  step('Save Company Details.'),
  step('Accept all Guidelines & Ethics items and Save Acknowledgements.'),
  step('Upload verification documents (for example Shop Act, LLP, PAN) as requested.'),
  step('Wait for SuperAdmin document / employer approval if still Pending.'),

  h2('5.4 Create and publish a posting'),
  step('Open Postings → create a new internship.'),
  step('Complete role details, stipend, work mode, locations, schedule, and screening questions.'),
  step('Save as Draft anytime (no point charge).'),
  step('When ready, Publish. If you lack 50 points, the product shows an error and suggests earning points or saving as draft.'),
  note('Re-publishing an already published role also costs 50 points. Moderators may pause or take down listings; you will see notifications / email for status changes.'),

  h2('5.5 Applicants and hiring'),
  bullet('Open a posting to manage applicants (statuses such as applied, interviewing, offered, rejected, hired).'),
  bullet('Use Messages for conversation; Offers to extend formal offers.'),
  bullet('Rejection templates speed up consistent decline messages.'),
  bullet('Analytics summarise hiring activity for your account.'),
  bullet('Search candidates to discover talent beyond a single posting.'),

  h2('5.6 Earn more publish capacity'),
  bullet('Refer other organisations via Refer & earn.'),
  bullet('Complete LinkedIn promo / viral share programmes when offered.'),
  bullet('Track balance on dashboard and referral pages.'),

  h1('6. SuperAdmin guide (platform operators)'),
  p('SuperAdmin oversees the marketplace. Sign in with the SuperAdmin account on the home page, then open the SuperAdmin workspace.'),
  h2('6.1 Typical tasks'),
  bullet('Employer approvals — approve or reject pending employers (domain / free-email paths).'),
  bullet('Documents — review uploaded verification files.'),
  bullet('Postings — publish, pause, or take down listings across employers; use bulk actions carefully.'),
  bullet('LinkedIn promos & Viral shares — review reward programmes.'),
  bullet('Login report & Listing reports — operational visibility.'),
  bullet('Messages & Feature ideas — platform communications and product feedback.'),
  note('Publishing an already-live posting again should not spam duplicate emails; only real status changes notify employers.'),

  h1('7. Shared features'),
  h2('7.1 Account'),
  p('Under Account you can update security settings (password, optional email 2FA), review sessions, and notification preferences where available.'),
  h2('7.2 Help chatbot'),
  p('A help chat control may appear on portal pages. Use it for product questions. It does not replace SuperAdmin support for account approvals.'),
  h2('7.3 Emails'),
  p('Transactional emails (for example moderation updates, offers, password reset) come from the platform mailer. Use unsubscribe links when present; some unsubscribe requests may be processed by operators.'),
  h2('7.4 Sign out'),
  p('Use Sign out in the header. You return to the public home / sign-in page.'),

  h1('8. Quick troubleshooting'),
  boldLead('Cannot publish — need 50 points: ', 'Earn points via referrals/shares, or save as draft. Signup gift is one publish’s worth.'),
  boldLead('Cannot publish — not approved / profile incomplete: ', 'Finish Profile & docs (stars + ethics) and wait for SuperAdmin approval.'),
  boldLead('Cannot apply — need 5 points: ', 'Use Refer & earn or other bonuses, then retry.'),
  boldLead('Google button on home does not log me in: ', 'Expected — login is email/password. Google is for registration verification.'),
  boldLead('Wrong workspace after login: ', 'Sign out and sign in with the correct role account. Each email has one role.'),

  h1('9. Upload this manual to Google Docs'),
  step('Open Google Drive → New → File upload → select InternSafar-User-Manual.docx.'),
  step('Open the uploaded file with Google Docs (Open with → Google Docs) to convert it to an editable Doc.'),
  step('Share → General access → Anyone with the link → Viewer (or Commenter if you prefer).'),
  step('Copy the link and share it with your users.'),
  note('This file is written for end users and operators. It intentionally omits developer setup, database migration commands, and secret credentials.'),

  new Paragraph({ children: [new PageBreak()] }),
  h1('Appendix A — Role homes (URLs)'),
  bullet('Candidate home: /candidate'),
  bullet('Employer home: /employer'),
  bullet('SuperAdmin home: /superadmin'),
  bullet('Register candidate: /register/candidate'),
  bullet('Register employer: /register/employer'),
  bullet('Account: /account'),
  bullet('Help: /help'),

  h1('Appendix B — Points cheat sheet'),
  bullet('Signup gift (candidate & employer): +50 points'),
  bullet('Apply: −5 points'),
  bullet('Publish / re-publish: −50 points'),
  bullet('Typical referral bonus: +25 points (when product rules are met)'),
  bullet('Draft internship: 0 points'),
];

const doc = new Document({
  creator: 'InternSafar',
  title: 'InternSafar User Manual',
  description: 'End-user manual for candidates, employers, and SuperAdmin operators',
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: 'steps',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: {
        styles: [
          {
            id: 'Normal',
            run: { font: 'Calibri', size: 22 },
          },
        ],
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'InternSafar User Manual', size: 18, color: '64748B' }),
              ],
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0', space: 8 },
              },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Page ', size: 16, color: '64748B' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
                new TextRun({ text: ' of ', size: 16, color: '64748B' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buffer);
  console.log('Wrote', OUT);
});
