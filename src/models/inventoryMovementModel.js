const mongoose = require('mongoose');

const movementTypes = ['add', 'remove', 'distribute', 'adjust'];

const inventoryMovementSchema = new mongoose.Schema(
	{
		inventoryID: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Inventory',
			required: true,
			index: true,
		},
		staffID: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		movementType: {
			type: String,
			enum: movementTypes,
			required: true,
		},
		quantityChange: {
			type: Number,
			required: true,
		},
		timestamp: {
			type: Date,
			default: Date.now,
		},
		notes: {
			type: String,
			trim: true,
			default: '',
		},
	},
	{
		timestamps: true,
	}
);

inventoryMovementSchema.index({ inventoryID: 1, timestamp: -1 });
inventoryMovementSchema.index({ staffID: 1, timestamp: -1 });

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
