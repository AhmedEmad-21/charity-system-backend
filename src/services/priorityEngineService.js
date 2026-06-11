const RecipientPriority = require('../models/recipientPriorityModel');
const RecipientRequest = require('../models/recipientRequestModel');
const IncomeScoreMapping = require('../models/incomeScoreMappingModel');
const FamilyScoreMapping = require('../models/familyScoreMappingModel');
const HealthScoreMapping = require('../models/healthScoreMappingModel');
const LastAidScoreMapping = require('../models/lastAidScoreMappingModel');

const DEFAULT_INCOME_SCORE = 5;
const DEFAULT_FAMILY_SCORE = 5;
const DEFAULT_HEALTH_SCORE = 5;
const DEFAULT_LAST_AID_SCORE = 5;

const findScoreInRange = (mappings, value, minField, maxField) => {
  const mapping = mappings.find((row) => {
    const min = row[minField];
    const max = row[maxField];
    if (max === null || max === undefined) {
      return value >= min;
    }
    return value >= min && value <= max;
  });

  return mapping ? mapping.score : null;
};

const monthsSince = (date) => {
  if (!date) return 120;

  const now = new Date();
  const yearDiff = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  const totalMonths = yearDiff * 12 + monthDiff;
  return Math.max(totalMonths, 0);
};

const calculateFinalScore = ({ needScore, familyScore, healthScore, lastAidScore }) => (
  needScore * 0.4 + familyScore * 0.25 + healthScore * 0.2 + lastAidScore * 0.15
);

const getIncomeScore = (monthlyIncome, mappings) => (
  findScoreInRange(mappings, monthlyIncome, 'minIncome', 'maxIncome') ?? DEFAULT_INCOME_SCORE
);

const getFamilyScore = (familyMembers, mappings) => (
  findScoreInRange(mappings, familyMembers, 'minMembers', 'maxMembers') ?? DEFAULT_FAMILY_SCORE
);

const getHealthScore = (healthStatus, mappings) => (
  mappings.find((row) => row.healthStatus === healthStatus)?.score ?? DEFAULT_HEALTH_SCORE
);

const getLastAidScore = (monthsSinceLastAid, mappings) => (
  findScoreInRange(mappings, monthsSinceLastAid, 'minMonths', 'maxMonths') ?? DEFAULT_LAST_AID_SCORE
);

const calculatePriority = async (
	{ recipientUserID, monthlyIncome, familyMembers, healthStatus },
	options = {}
) => {
  const [incomeMappings, familyMappings, healthMappings, lastAidMappings] = await Promise.all([
    IncomeScoreMapping.find().sort({ minIncome: 1 }),
    FamilyScoreMapping.find().sort({ minMembers: 1 }),
    HealthScoreMapping.find(),
    LastAidScoreMapping.find().sort({ minMonths: 1 }),
  ]);

  const latestFulfilledRequest = await RecipientRequest.findOne({
    recipientUserID,
    status: 'fulfilled',
  })
    .sort({ updatedAt: -1 })
    .lean();

  const needScore = getIncomeScore(monthlyIncome, incomeMappings);
  const familyScore = getFamilyScore(familyMembers, familyMappings);
  const healthScore = getHealthScore(healthStatus, healthMappings);

  const elapsedMonths = monthsSince(latestFulfilledRequest?.updatedAt || null);
  const lastAidScore = getLastAidScore(elapsedMonths, lastAidMappings);

  const finalScore = calculateFinalScore({
    needScore,
    familyScore,
    healthScore,
    lastAidScore,
  });

  const session = options.session || null;
  const existing = await RecipientPriority.findOne({ recipientUserID }).session(session);

  return RecipientPriority.findOneAndUpdate(
    { recipientUserID },
    {
      recipientUserID,
      needScore,
      familyScore,
      healthScore,
      lastAidScore,
      finalScore,
      lastCalculated: new Date(),
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      session,
    }
  );
};

module.exports = {
  calculatePriority,
  getIncomeScore,
  getFamilyScore,
  getHealthScore,
  getLastAidScore,
  upsertPriorityFromVettingData: calculatePriority,
};
