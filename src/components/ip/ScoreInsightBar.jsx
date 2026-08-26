'use client';

import { scoreBand, formatScoreReadout, bandClass, explainMatchPlain, explainValidationPlain } from '@/lib/ipScoreBands';
import './ip-score-insight.css';

/**
 * Shared Match / Validation insight — same component for Browse cards, list cells, and detail.
 * @param {'match'|'validation'} kind
 * @param {'compact'|'comfortable'|'detail'} size
 */
export default function ScoreInsightBar({
  kind = 'match',
  score,
  size = 'compact',
  breakdown = null,
  matchDetail = null,
  why = '',
  className = '',
}) {
  const n = score == null || score === '' ? null : Math.round(Number(score));
  const band = n == null ? null : scoreBand(n);
  const readout = formatScoreReadout(n, { mode: kind === 'validation' ? 'of100' : 'plus' });
  const label = kind === 'validation' ? 'Validation' : 'Match';
  const tip = why
    || (kind === 'match'
      ? explainMatchPlain(matchDetail || { percent: n ?? 0, matched: [], missing: [], requiredCount: matchDetail?.requiredCount ?? 0 })
      : explainValidationPlain(n, breakdown));

  return (
    <div
      className={`ip-score-insight ip-score-insight--${size} ip-score-insight--${kind} ${bandClass(band)} ${className}`.trim()}
      title={tip}
      aria-label={n == null ? `${label} unavailable` : `${label} ${n}, ${band || 'unknown'}`}
    >
      <div className="ip-score-insight__head">
        <span className="ip-score-insight__label">{label}</span>
        <span className="ip-score-insight__readout">{readout}</span>
        {band ? <span className="ip-score-insight__band">{band}</span> : null}
      </div>
      <div className="ip-score-insight__track" aria-hidden>
        <div
          className="ip-score-insight__fill"
          style={{ width: `${Math.max(0, Math.min(100, n ?? 0))}%` }}
        />
      </div>
      {size === 'detail' && tip ? (
        <p className="ip-score-insight__why">{tip}</p>
      ) : null}
    </div>
  );
}

export function MatchValidationPair({
  matchScore,
  validationScore,
  matchDetail = null,
  validationBreakdown = null,
  size = 'compact',
  className = '',
}) {
  return (
    <div className={`ip-score-pair ip-score-pair--${size} ${className}`.trim()}>
      <ScoreInsightBar kind="match" score={matchScore} size={size} matchDetail={matchDetail} />
      <ScoreInsightBar
        kind="validation"
        score={validationScore}
        size={size}
        breakdown={validationBreakdown}
      />
    </div>
  );
}
