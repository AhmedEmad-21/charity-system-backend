module.exports = {
  type: 'object',
  additionalProperties: false, // هذا هو السبب في ضياع البيانات
  required: ['donorID', 'proposedPickupTime', 'pickupLocation'],
  properties: {
    donorID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
    proposedPickupTime: { type: 'string', format: 'date-time' },
    pickupLocation: { type: 'string', minLength: 1 },
    status: { enum: ['pendingPickup', 'pickedUp', 'sorted', 'stored', 'distributed'] },
    currentStatus: { enum: ['pendingPickup', 'pickedUp', 'sorted', 'stored', 'distributed'] },
    notes: { type: 'string' },
    // الإضافات الضرورية لكي يعمل نظام التخزين:
    quantity: { type: 'number' },
    itemName: { type: 'string' },
    category: { type: 'string' },
    staffID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
  }
};
