'use client';

import { postingSectionsFromRow, bulletLines } from '@/lib/ipPostingBody';
import './ip-posting-body.css';

function SectionBlock({ title, text, emptyHint }) {
  const lines = bulletLines(text);
  const plain = String(text || '').trim();
  return (
    <section className="ip-posting-sec">
      <h3 className="ip-posting-sec__title">{title}</h3>
      {!plain ? (
        <p className="ip-posting-sec__empty">{emptyHint}</p>
      ) : lines.length > 1 || (lines.length === 1 && plain.startsWith('-')) ? (
        <ul className="ip-posting-sec__list">
          {(lines.length ? lines : [plain.replace(/^[-•*]\s*/, '')]).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : lines.length === 1 ? (
        <ul className="ip-posting-sec__list">
          <li>{lines[0]}</li>
        </ul>
      ) : (
        <p className="ip-posting-sec__body">{plain}</p>
      )}
    </section>
  );
}

/** Candidate-facing structured JD blocks. */
export default function PostingBodySections({ internship }) {
  const { about, requirements, ideal, skills } = postingSectionsFromRow(internship);
  return (
    <div className="ip-posting-body">
      <SectionBlock
        title="About This Role"
        text={about}
        emptyHint="No role description provided yet."
      />
      <SectionBlock
        title="Minimum Requirements"
        text={requirements || (skills.length ? skills.map((s) => `Skill: ${s}`).join('\n') : '')}
        emptyHint="No minimum requirements listed."
      />
      <SectionBlock
        title="Ideal Candidate Profile"
        text={ideal}
        emptyHint="No ideal-candidate notes listed."
      />
    </div>
  );
}
