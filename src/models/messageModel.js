const mongoose = require('mongoose');

const messageTypes = [
    'donation_received',
    'donation_sorted',
    'inventory_added',
    'donation_distributed',
    'request_approved',
];

const messageSchema = new mongoose.Schema(
    {
        userID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        relatedDonationID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DonationReq',
            default: null,
            index: true,
        },
        messageType: {
            type: String,
            enum: messageTypes,
            required: true,
        },
        content: {
            type: String,
            required: true,
            trim: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

messageSchema.index({ userID: 1, isRead: 1, createdAt: -1 });
messageSchema.index({ userID: 1, createdAt: -1 });
messageSchema.index({ isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);