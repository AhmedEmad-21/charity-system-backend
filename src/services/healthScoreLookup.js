/**
 * Mirrors the HealthMapping table from the system spec.
 * In production, pull this from the DB (HealthMapping model) instead of a static
 * object, so an admin/doctor can tune it without a code deploy.
 */
const HEALTH_SCORE_TABLE = {
  'healthy:none': 2,
  'chronic_illness:mild': 5,
  'chronic_illness:moderate': 7,
  'chronic_illness:severe': 9,
  'disability:mild': 6,
  'disability:moderate': 8,
  'disability:severe': 10
};

function lookupHealthScore(healthStatus, severity) {
  const key = `${healthStatus}:${severity}`;
  return HEALTH_SCORE_TABLE[key] ?? 2; // unmapped combos default to the lowest/safest score
}

module.exports = { lookupHealthScore, HEALTH_SCORE_TABLE };
