module.exports = {
  type: 'object',
  additionalProperties: false,
  // 🎯 تعديل الـ required ليكون خاص ببيانات الصنف الأساسية في المخزن فقط
  required: ['itemName', 'quantity', 'storageLocation'],
  properties: {
    // حقول المخزن الأساسية
    itemName: { type: 'string', minLength: 1 },
    category: { type: 'string' },
    quantity: { type: 'number', minimum: 0 },
    itemCondition: { enum: ['new', 'excellent', 'good', 'fair'] },
    storageLocation: { type: 'string', minLength: 1 },
    monthlyLimit: { type: 'number', minimum: 0 },
    itemPointsCost: { type: 'number', minimum: 0 },

    // حقول اختيارية أو حركية (تترك اختيارية هنا حتى لا تكسر الـ POST عند الإنشاء الأول)
    sourceItemID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
    staffID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
    lastMovementDate: { type: 'string', format: 'date-time' },
    movementNotes: { type: 'string' },
  },
};
