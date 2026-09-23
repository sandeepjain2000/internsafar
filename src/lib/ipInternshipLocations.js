/**
 * Human-readable work cities for internship rows / employer preview forms.
 * Prefers `locations` (or `locationCities` on unsaved forms), then single `location`.
 */
export function formatInternshipLocations(row) {
  if (!row) return null;
  const fromLocations = Array.isArray(row.locations)
    ? row.locations.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  const fromCities = Array.isArray(row.locationCities)
    ? row.locationCities.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  const cities = fromLocations.length ? fromLocations : fromCities;
  if (cities.length) {
    // De-dupe while preserving order
    const seen = new Set();
    const unique = [];
    for (const c of cities) {
      const key = c.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(c);
    }
    return unique.join(', ');
  }
  const single = String(row.location || '').trim();
  return single || null;
}
