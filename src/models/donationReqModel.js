const mongoose = require('mongoose');

const donationStatuses = ['pendingPickup', 'pickedUp', 'sorted', 'stored', 'distributed'];

const donationReqSchema = new mongoose.Schema(
    {
        donorID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        creationDate: {
            type: Date,
            default: Date.now,
        },
        proposedPickupTime: {
            type: Date,
            required: true,
        },
        pickupLocation: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: donationStatuses,
            default: 'pendingPickup',
        },
        notes: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('DonationReq', donationReqSchema);