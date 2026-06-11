const DonationReq = require('../models/donationReqModel');
const messageService = require('./messageService');
const createCrudService = require('./crudServiceFactory');
const { BadRequestError } = require('../errors/appErrors');

const baseService = createCrudService(DonationReq);

const donationStatuses = ['pendingPickup', 'pickedUp', 'sorted', 'stored', 'distributed'];

const donationMessageByStatus = {
	pendingPickup: 'Your donation request has been received and is pending pickup.',
	pickedUp: 'Your donation has been picked up by our team.',
	sorted: 'Your donation has been sorted.',
	stored: 'Your donation items are now stored in inventory.',
	distributed: 'Your donation has been distributed to recipients in need.',
};

const messageTypeByStatus = {
	pendingPickup: 'donation_received',
	pickedUp: 'donation_received',
	sorted: 'donation_sorted',
	stored: 'inventory_added',
	distributed: 'donation_distributed',
};

module.exports = {
	...baseService,
	async createDonationRequest(data, options = {}) {
		const created = await baseService.create(data, options);

		await messageService.create({
			userID: created.donorID,
			relatedDonationID: created._id,
			messageType: 'donation_received',
			content: donationMessageByStatus.pendingPickup,
		});

		return created;
	},

	async fetchUserDonations(userId) {
		return DonationReq.find({ donorID: userId }).sort({ createdAt: -1 });
	},

	async fetchDonationById(id) {
		return DonationReq.findById(id);
	},

	async fetchAllDonations() {
		return DonationReq.find({}).sort({ createdAt: -1 });
	},

	async updateStatus(id, data, options = {}) {
		let previousDonation = null;

		if (data?.status) {
			previousDonation = await DonationReq.findById(id).select('status donorID');
			if (!previousDonation) {
				return null;
			}

			const fromIndex = donationStatuses.indexOf(previousDonation.status);
			const toIndex = donationStatuses.indexOf(data.status);

			if (toIndex === -1) {
				throw new BadRequestError('Invalid donation status');
			}

			// Allow same status or one-step forward only.
			if (fromIndex !== -1 && toIndex - fromIndex > 1) {
				throw new BadRequestError('Donation status transition cannot skip workflow steps');
			}
		}

		const updatedDonation = await baseService.updateById(id, data, options);

		if (
			updatedDonation &&
			data?.status &&
			previousDonation &&
			previousDonation.status !== data.status
		) {
			await messageService.create({
				userID: updatedDonation.donorID,
				relatedDonationID: updatedDonation._id,
				messageType: messageTypeByStatus[data.status],
				content: donationMessageByStatus[data.status] || `Your donation status changed to ${data.status}.`,
			});
		}

		return updatedDonation;
	},

	// Backward compatibility
	create: async (data, options = {}) => module.exports.createDonationRequest(data, options),
	updateById: async (id, data, options = {}) => module.exports.updateStatus(id, data, options),
};
