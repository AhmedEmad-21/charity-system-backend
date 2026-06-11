const mongoose = require('mongoose');

// MILESTONE 6: Request Locking - prevent double processing
// Status transitions: pending → processing → approved/rejected/fulfilled
const requestStatuses = ['pending', 'approved', 'rejected', 'fulfilled'];

const recipientRequestSchema = new mongoose.Schema(
    {
        recipientUserID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        requestDate: {
            type: Date,
            default: Date.now,
            index: true,
        },
        status: {
            type: String,
            enum: requestStatuses,
            default: 'pending',
            index: true,
        },
        notes: {
            type: String,
            trim: true,
            default: '',
        },
        staffReviewerID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        // MILESTONE 6: Processing state to prevent concurrent approvals
        processingStarted: {
            type: Date,
            default: null,
            index: true,
        },

        // MILESTONE 6: Lock expiry for safety (30 minutes max)
        processingExpiresAt: {
            type: Date,
            default: null,
        },

        // MILESTONE 13: Audit trail for completeness
        reviewedAt: {
            type: Date,
            default: null,
        },

        // For error recovery
        lastError: {
            code: String,
            message: String,
            timestamp: Date,
        },
    },
    {
        timestamps: true,
    }
);

recipientRequestSchema.index({ recipientUserID: 1, status: 1, requestDate: -1 });
recipientRequestSchema.index({ recipientUserID: 1, requestDate: -1 });
recipientRequestSchema.index({ status: 1, requestDate: -1 });

module.exports = mongoose.model('RecipientRequest', recipientRequestSchema);