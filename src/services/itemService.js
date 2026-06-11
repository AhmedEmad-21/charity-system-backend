const Item = require('../models/itemModel');
const createCrudService = require('./crudServiceFactory');
const inventoryService = require('./inventoryService');
const { uploadImage, deleteImage, updateImage } = require('./uploadService');
const { BadRequestError } = require('../errors/appErrors');

const baseService = createCrudService(Item);

module.exports = {
	...baseService,

	async uploadImage(file, metadata = {}) {
		const uploaded = await uploadImage(file, {
			folder: metadata.folder,
			publicIdPrefix: metadata.publicIdPrefix || 'item',
		});

		return uploaded;
	},

	async deleteImage(publicId) {
		return deleteImage(publicId);
	},

	async updateImage({ previousPublicId, file, metadata = {} }) {
		return updateImage({
			previousPublicId,
			file,
			options: {
				folder: metadata.folder,
				publicIdPrefix: metadata.publicIdPrefix || 'item',
			},
		});
	},

	async createItemLogic(data, options = {}) {
		if (Object.prototype.hasOwnProperty.call(data, 'quantity') && Number(data.quantity) < 0) {
			throw new BadRequestError('Item quantity cannot be negative');
		}

		if (data.imageFile) {
			const uploaded = await module.exports.uploadImage(data.imageFile, {
				publicIdPrefix: `item_${data.name || 'unnamed'}`,
			});

			data.imageURL = uploaded.url;
			data.imagePublicId = uploaded.publicId;
			delete data.imageFile;
		}

		return baseService.create(data, options);
	},

	async fetchItem(id, options = {}) {
		return baseService.getById(id, options);
	},

	async fetchItems(filter = {}, options = {}) {
		return baseService.list(filter, options);
	},

	async updateItemLogic(id, data, options = {}) {
		const previous = await Item.findById(id);
		if (!previous) {
			return null;
		}

		if (Object.prototype.hasOwnProperty.call(data, 'quantity') && Number(data.quantity) < 0) {
			throw new BadRequestError('Item quantity cannot be negative');
		}

		if (data.status === 'sorted' && !data.staffID) {
			throw new BadRequestError('staffID is required when marking an item as sorted');
		}

		if (data.imageFile) {
			const uploaded = await module.exports.updateImage({
				previousPublicId: previous.imagePublicId,
				file: data.imageFile,
				metadata: { publicIdPrefix: `item_${data.name || previous.name || 'unnamed'}` },
			});

			data.imageURL = uploaded.url;
			data.imagePublicId = uploaded.publicId;
			delete data.imageFile;
		}

		if (data.removeImage === true && previous.imagePublicId) {
			await module.exports.deleteImage(previous.imagePublicId);
			data.imageURL = '';
			data.imagePublicId = '';
		}

		const updated = await baseService.updateById(id, data, options);

		if (data.status === 'sorted' && previous.status !== 'sorted') {
			await inventoryService.upsertFromSortedItem(updated, {
				staffID: data.staffID,
				session: options.session || null,
			});
			updated.sortedAt = new Date();
			await updated.save({ session: options.session || null });
		}

		return updated;
	},

	async deleteItemLogic(id, options = {}) {
		return baseService.deleteById(id, options);
	},

	// Backward compatibility
	create: async (data, options = {}) => module.exports.createItemLogic(data, options),
	updateById: async (id, data, options = {}) => module.exports.updateItemLogic(id, data, options),
	deleteById: async (id, options = {}) => module.exports.deleteItemLogic(id, options),
};
