const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
	{
		sourceItemID: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Item',
			required: true,
			index: true,
		},
		itemName: {
			type: String,
			required: true,
			trim: true,
		},
		category: {
			type: String,
			default: '',
			trim: true,
		},
		quantity: {
			type: Number,
			required: true,
			min: 0,
		},
		itemCondition: {
			type: String,
			required: true,
			trim: true,
		},
		storageLocation: {
			type: String,
			required: true,
			trim: true,
		},
		monthlyLimit: {
			type: Number,
			required: true,
			min: 0,
			default: 100,
		},
		itemPointsCost: {
			type: Number,
			required: true,
			min: 0,
			default: 1,
		},
		lastMovementDate: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
	}
);

inventorySchema.index({ itemName: 1 });
inventorySchema.index({ quantity: 1 });
inventorySchema.index({ category: 1 });
inventorySchema.index({ category: 1, quantity: 1 });
inventorySchema.index({ quantity: 1, createdAt: -1 });

module.exports = mongoose.model('Inventory', inventorySchema);
