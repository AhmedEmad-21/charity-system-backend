const { Family, FamilyMember } = require('../models');
const { assessHealthRecord } = require('../services/AIHealthAssessment');
const { lookupHealthScore } = require('../services/healthScoreLookup');

/**
 * POST /api/families/:familyId/health-assessment
 *
 * Body shape:
 * {
 *   "members": [
 *     { "memberId": "uuid", "medicalRecordText": "free text medical report/diagnosis" },
 *     { "memberId": "uuid", "medicalRecordText": "..." }
 *   ]
 * }
 *
 * For each member: sends their record to Gemini, gets back a classification,
 * looks up the numeric score, and updates the FamilyMember row.
 * Then recomputes the family's health sub-score (MAX across members) and
 * marks the family as needing a full need_score recalculation.
 */
async function updateFamilyHealthAssessment(req, res) {
  const { familyId } = req.params;
  const { members } = req.body;

  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({
      error: 'Body must include members[], each with memberId and medicalRecordText'
    });
  }

  const family = await Family.findById(familyId);
  if (!family) {
    return res.status(404).json({ error: 'Family not found' });
  }

  const results = [];

  for (const m of members) {
    const { memberId, medicalRecordText } = m;

    if (!memberId || !medicalRecordText) {
      results.push({ memberId, error: 'memberId and medicalRecordText are both required' });
      continue;
    }

    const member = await FamilyMember.findOne({
      _id: memberId, family_id: familyId
    });

    if (!member) {
      results.push({ memberId, error: 'Member not found on this family' });
      continue;
    }

    try {
      const assessment = await assessHealthRecord(medicalRecordText);
      const score = lookupHealthScore(assessment.health_status, assessment.severity);

      member.health_status = assessment.health_status;
      member.health_severity = assessment.severity;
      await member.save();

      results.push({
        memberId,
        health_status: assessment.health_status,
        severity: assessment.severity,
        score,
        reasoning: assessment.reasoning
      });
    } catch (err) {
      results.push({ memberId, error: err.message });
    }
  }

  // Family health sub-score = MAX across all members (per the scoring spec)
  const allMembers = await FamilyMember.find({ family_id: familyId });
  const memberScores = allMembers.map((mem) =>
    lookupHealthScore(mem.health_status, mem.health_severity)
  );
  const healthSubScore = memberScores.length ? Math.max(...memberScores) : 0;

  family.health_sub_score = healthSubScore;
  family.score_last_calculated_at = null;
  await family.save();

  res.json({ familyId, healthSubScore, members: results });
}

module.exports = { updateFamilyHealthAssessment };
