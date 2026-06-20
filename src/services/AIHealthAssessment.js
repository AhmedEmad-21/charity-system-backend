const { Type, FunctionCallingConfigMode } = require('@google/genai');
const ai = require('../config/geminiClient');

/**
 * The function Gemini is forced to call. It must classify the record
 * into a fixed set of categories — the AI never invents a free-form score.
 * The numeric score itself comes later from a lookup table (healthScoreLookup.js),
 * so the rubric stays auditable and consistent across every family.
 */
const assessHealthScoreDeclaration = {
  name: 'assess_health_score',
  description:
    "Classifies a family member's medical record into a health status category and severity tier, based strictly on the clinical content provided.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      health_status: {
        type: Type.STRING,
        enum: ['healthy', 'chronic_illness', 'disability'],
        description: 'Overall health classification based on the record.'
      },
      severity: {
        type: Type.STRING,
        enum: ['none', 'mild', 'moderate', 'severe'],
        description: 'Severity tier. Must be "none" only when health_status is "healthy".'
      },
      reasoning: {
        type: Type.STRING,
        description: 'One or two sentence clinical justification referencing specific details from the record.'
      }
    },
    required: ['health_status', 'severity', 'reasoning']
  }
};

const SYSTEM_INSTRUCTION = `You are a clinical record classifier for a charity aid allocation system.
Read the medical record text and classify it using the assess_health_score function only.
Do not infer beyond what the record actually states. If the record is too vague to
determine severity confidently, choose the lower (less severe) tier and explain why
in the reasoning field.`;

/**
 * Sends one medical record to Gemini and returns the forced function-call result.
 * @param {string} medicalRecordText - free text (typed notes, OCR output, doctor summary, etc.)
 * @returns {Promise<{health_status: string, severity: string, reasoning: string}>}
 */
async function assessHealthRecord(medicalRecordText) {
  if (!medicalRecordText || typeof medicalRecordText !== 'string') {
    throw new Error('medicalRecordText must be a non-empty string');
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: medicalRecordText }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: [assessHealthScoreDeclaration] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ['assess_health_score']
        }
      },
      temperature: 0
    }
  });

  const call = response.functionCalls && response.functionCalls[0];

  if (!call || call.name !== 'assess_health_score') {
    throw new Error('Gemini did not return a valid health assessment for this record');
  }

  return call.args;
}

module.exports = { assessHealthRecord };
