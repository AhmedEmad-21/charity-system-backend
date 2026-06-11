const mongoose = require('mongoose');

const itemStatuses = ['pendingSort', 'sorted', 'stored'];

const itemSchema = new mongoose.Schema(
    {
        donationID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DonationReq',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        category: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
        },
        imageURL: {
            type: String,
            default: '',
        },
        imagePublicId: {
            type: String,
            default: '',
        },
        status: {
            type: String,
            enum: itemStatuses,
            default: 'pendingSort',
            index: true,
        },
        sortedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Item', itemSchema);