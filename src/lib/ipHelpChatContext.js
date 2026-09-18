/**
 * InternSafar help context for the NVIDIA Help Chatbot.
 * Grounding from public help / how-it-works routes and known product facts.
 * Do not put secrets here.
 *
 * Answers are natural-language via NVIDIA — not a rigid FAQ script.
 */

export const INTERNSAFAR_HELP_SYSTEM_PROMPT = `You are the InternSafar Help Assistant for the Internship Portal (InternSafar).

Your job is to answer user questions in clear, natural language about how to use InternSafar.
Use the product facts below as grounding. Paraphrase and explain helpfully — do not paste a canned FAQ block or invent features.

Help with:
- Signing in (email/password + CAPTCHA; Google sign-in for linked accounts)
- Candidate registration (Sign up with Google / Gmail)
- Employer registration and SuperAdmin approval where relevant
- Browsing internships, applying, tracking applications
- Messaging (email-style inbox)
- Employer posting / ethics / profile docs
- Navigation tips for candidate, employer, and SuperAdmin areas

Product facts you may use:
- Public pages: / (sign in), /register, /register/candidate, /register/employer, /help, /how-it-works, /forgot-password
- After login candidates use /candidate; employers /employer; SuperAdmin /superadmin
- Candidates: Gmail-oriented signup; Google registration can open an authenticated session
- Employers: work email / domain or form path; may need SuperAdmin approval and ethics/docs before live posts
- CAPTCHA: Security Verification on login; “New Code” regenerates the arithmetic challenge
- Messaging is email-style (subject = last message), not chat-bubble threads
- Fairness guidelines apply to internship posts; employers also accept ethics on profile

Rules:
- Stay focused on InternSafar product help. Refuse unrelated topics politely and redirect to product help.
- Do not invent features that are not supported by the facts above.
- Do not claim live support tickets or human agents.
- Never ask for or reveal passwords, API keys, database URLs, tokens, or private data.
- If unsure, say you are not sure and suggest /help or /how-it-works.
- Keep answers concise (short paragraphs or simple numbered steps). Prefer clear next steps.
- Write naturally; do not sound like a keyword-matched FAQ lookup.
- Plain text only in replies. Do NOT use Markdown (no **bold**, no __underline__, no # headings, no \`code\`, no [links](url)). Write "1. Go to the registration page" not "1. **Go to the Registration Page**:".
`;

/**
 * Strip common Markdown so chat bubbles (plain text) do not show raw ** or similar.
 */
export function plainTextHelpReply(text) {
  let s = String(text || '');
  // bold/italic markers
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/\*([^*\n]+)\*/g, '$1');
  s = s.replace(/_([^_\n]+)_/g, '$1');
  // inline code / fences
  s = s.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```\w*\n?/g, '').replace(/```/g, '').trim(),
  );
  s = s.replace(/`([^`]+)`/g, '$1');
  // markdown links [label](url) -> label
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // headings
  s = s.replace(/^#{1,6}\s+/gm, '');
  return s.trim();
}


/**
 * Starter chips by audience. Guest/unknown see general product help.
 * Logged-in roles only see questions relevant to that role.
 */
export const INTERNSAFAR_HELP_STARTERS_BY_ROLE = {
  guest: [
    'How do I sign in?',
    'How do I register as a candidate?',
    'How do I register as an employer?',
    'Where is How it works?',
  ],
  candidate: [
    'How do I browse internships?',
    'How do I apply for an internship?',
    'How do I track my applications?',
    'Where is How it works?',
  ],
  employer: [
    'How do I post an internship?',
    'How does employer verification work?',
    'How do I review applicants?',
    'Where is How it works?',
  ],
  superadmin: [
    'How do I approve employer registrations?',
    'Where is the SuperAdmin dashboard?',
    'Where is How it works?',
    'Where is the Help Center?',
  ],
};

/** @deprecated use helpStartersForRole — kept for any old imports */
export const INTERNSAFAR_HELP_STARTERS = INTERNSAFAR_HELP_STARTERS_BY_ROLE.guest;

export function helpStartersForRole(role) {
  const key = String(role || '').toLowerCase();
  if (key === 'candidate' || key === 'employer' || key === 'superadmin') {
    return INTERNSAFAR_HELP_STARTERS_BY_ROLE[key];
  }
  return INTERNSAFAR_HELP_STARTERS_BY_ROLE.guest;
}

export function helpFollowUpsForRole(role) {
  const key = String(role || '').toLowerCase();
  if (key === 'candidate') {
    return [
      'How do I update my profile?',
      'How do I apply for an internship?',
      'Where is How it works?',
    ];
  }
  if (key === 'employer') {
    return [
      'How do I post an internship?',
      'How do I review applicants?',
      'Where is How it works?',
    ];
  }
  if (key === 'superadmin') {
    return [
      'How do I approve employer registrations?',
      'Where is the Help Center?',
      'Where is How it works?',
    ];
  }
  return [
    'How do I sign in?',
    'How do I register as a candidate?',
    'Where is How it works?',
  ];
}

export function helpWelcomeForRole(role) {
  const key = String(role || '').toLowerCase();
  if (key === 'candidate') {
    return 'Hello! I can help you browse internships, apply, track applications, and use your candidate dashboard.';
  }
  if (key === 'employer') {
    return 'Hello! I can help you post internships, manage applicants, and use employer features on InternSafar.';
  }
  if (key === 'superadmin') {
    return 'Hello! I can help you with SuperAdmin tasks like approvals and navigating InternSafar admin tools.';
  }
  return 'Hello! I can help you navigate InternSafar — sign in, register, find help guides, and learn how the portal works.';
}
