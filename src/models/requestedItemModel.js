const mongoose = require('mongoose');

const requestedItemSchema = new mongoose.Schema(
    {
        recipientRequestID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'RecipientRequest',
            required: true,
            index: true,
        },
        inventoryID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Inventory',
            required: true,
            index: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
    },
    {
        timestamps: true,
    }
);

requestedItemSchema.index({ recipientRequestID: 1, inventoryID: 1 }, { unique: true });
requestedItemSchema.index({ recipientRequestID: 1, createdAt: -1 });

module.exports = mongoose.model('RequestedItem', requestedItemSchema);