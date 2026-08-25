-- Repair applications left on 'offered' after the offer was already accepted
-- or declined (two-step PATCH before it ran in one transaction).
-- Live check before apply: only accepted+'offered' rows; 0 declined mismatches.

UPDATE ip_applications a
SET status = 'hired', updated_at = now()
FROM ip_offers o
WHERE o.application_id = a.id
  AND o.status = 'accepted'
  AND a.status = 'offered';

UPDATE ip_applications a
SET status = 'declined_offer', updated_at = now()
FROM ip_offers o
WHERE o.application_id = a.id
  AND o.status = 'declined'
  AND a.status IN ('offered', 'applied');
