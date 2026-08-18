/** Shared constants for posting compliance + verification attestations */

export const POSTING_GUIDELINES = [
  {
    id: 'no_charge',
    label: 'I will not charge students any fee for this internship (application, training, or placement).',
  },
  {
    id: 'no_data_resale',
    label: 'I will not collect or use student data to sell unrelated products or services.',
  },
  {
    id: 'genuine_role',
    label: 'This is a genuine learning internship with defined work and mentorship — not unpaid full-time labour without learning.',
  },
  {
    id: 'accurate_listing',
    label: 'The stipend, location, duration, mode, and eligibility in this posting are accurate and current.',
  },
  {
    id: 'no_illegal_bond',
    label: 'I will not impose illegal bonds, deposits, or recovery amounts against interns.',
  },
  {
    id: 'privacy',
    label: 'I will handle candidate data with reasonable privacy and only for this hiring process.',
  },
  {
    id: 'fair_selection',
    label: 'I will evaluate candidates fairly on published criteria and will not discriminate unlawfully.',
  },
  {
    id: 'no_mlm',
    label: 'This internship is not linked to multilevel marketing, franchise selling, or forcing recruits to enrol others.',
  },
];

export const REQUIRED_GUIDELINE_IDS = POSTING_GUIDELINES.map((g) => g.id);
