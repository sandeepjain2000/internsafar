/**
 * Baseline Nova Labs postings for core reset seed.
 * Captured from live core employer after QA-fixture purge (≈2+ UI pages).
 * status: published | paused | draft
 * blankRequirements: intentional empty Minimum Requirements showcase
 */
const CORE_BASELINE_POSTINGS = [
  { title: 'Frontend Developer Intern', status: 'published' },
  { title: 'Backend API Intern', status: 'published' },
  { title: 'Data Analyst Intern', status: 'published' },
  { title: 'React Native Mobile Intern', status: 'published' },
  { title: 'Product Design Intern', status: 'published' },
  { title: 'QA Automation Intern', status: 'published' },
  { title: 'DevOps & Cloud Intern', status: 'published' },
  { title: 'Machine Learning Intern', status: 'published' },
  { title: 'Full-Stack Web Intern', status: 'published' },
  { title: 'Growth Marketing Intern', status: 'published' },
  { title: 'Business Analyst Intern', status: 'published' },
  { title: 'Cybersecurity Intern', status: 'published' },
  { title: 'UI Engineering Intern', status: 'published' },
  { title: 'Content Strategy Intern', status: 'published' },
  { title: 'Salesforce Admin Intern', status: 'published' },
  { title: 'Data Engineering Intern', status: 'published' },
  { title: 'Customer Success Intern', status: 'published' },
  { title: 'Technical Writing Intern', status: 'published' },
  { title: 'Android Kotlin Intern', status: 'published' },
  { title: 'iOS Swift Intern', status: 'published' },
  { title: 'Core Showcase Frontend', status: 'published' },
  { title: 'Core Showcase Data', status: 'published' },
  { title: 'Supply Chain Analytics Intern', status: 'paused' },
  { title: 'Paused Design', status: 'paused' },
  { title: 'People Ops Intern', status: 'draft' },
  { title: 'Design Intern (Draft)', status: 'draft' },
  { title: 'Core Showcase Draft', status: 'draft' },
  // Showcase empty requirements (not majority — reviewers see empty-state UI)
  { title: 'Risk Analytics Intern', status: 'published', blankRequirements: true },
  { title: 'Logistics Optimization Intern', status: 'published', blankRequirements: true },
];

module.exports = { CORE_BASELINE_POSTINGS };
