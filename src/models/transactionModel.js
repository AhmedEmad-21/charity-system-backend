const mongoose = require('mongoose');

const transactionStatuses = ['pending', 'completed', 'failed', 'refunded'];

const transactionSchema = new mongoose.Schema(
	{
		donorID: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		amount: {
			type: Number,
			required: true,
			min: 0.01,
		},
		date: {
			type: Date,
			default: Date.now,
		},
		paymentMethod: {
			type: String,
			required: true,
			trim: true,
		},
		status: {
			type: String,
			required: true,
			enum: transactionStatuses,
			default: 'pending',
		},
	},
	{
		timestamps: true,
	}
);

transactionSchema.index({ donorID: 1, date: -1 });
transactionSchema.index({ status: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
