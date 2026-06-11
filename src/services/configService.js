const Config = require('../models/configModel');
const SystemAuditLog = require('../models/systemAuditLogModel');
const User = require('../models/userModel');
const DonationReq = require('../models/donationReqModel');
const Inventory = require('../models/inventoryModel');
const VettingRequest = require('../models/vettingRequestModel');
const RecipientRequest = require('../models/recipientRequestModel');
const createCrudService = require('./crudServiceFactory');

const baseService = createCrudService(Config);

const writeAudit = async (payload) => {
	try {
		await SystemAuditLog.create(payload);
	} catch (error) {
		console.error('[ConfigAudit]', error.message);
	}
};

module.exports = {
	...baseService,

	async create(data, options = {}) {
		const created = await baseService.create(data, options);
		await writeAudit({
			eventType: 'config_created',
			status: 'success',
			details: { settingName: created.settingName, settingValue: created.settingValue },
			executedAt: new Date(),
		});
		return created;
	},

	async updateById(id, data, options = {}) {
		const updated = await baseService.updateById(id, data, options);
		if (updated) {
			await writeAudit({
				eventType: 'config_updated',
				status: 'success',
				details: { settingName: updated.settingName, settingValue: updated.settingValue },
				executedAt: new Date(),
			});
		}

		return updated;
	},

	async deleteById(id, options = {}) {
		const deleted = await baseService.deleteById(id, options);
		if (deleted) {
			await writeAudit({
				eventType: 'config_deleted',
				status: 'success',
				details: { settingName: deleted.settingName },
				executedAt: new Date(),
			});
		}

		return deleted;
	},

	async calculateStats() {
		const [
			totalUsers,
			totalDonors,
			totalRecipients,
			totalStaff,
			totalAdmins,
			totalDonations,
			totalInventoryItems,
			pendingRecipientRequests,
			approvedRecipientRequests,
			fulfilledRecipientRequests,
		] = await Promise.all([
			User.countDocuments({}),
			User.countDocuments({ role: 'Donor' }),
			User.countDocuments({ role: 'Recipient' }),
			User.countDocuments({ role: 'Staff' }),
			User.countDocuments({ role: 'Admin' }),
			DonationReq.countDocuments({}),
			Inventory.countDocuments({}),
			RecipientRequest.countDocuments({ status: 'pending' }),
			RecipientRequest.countDocuments({ status: 'approved' }),
			RecipientRequest.countDocuments({ status: 'fulfilled' }),
		]);

		return {
			totals: {
				totalUsers,
				totalDonors,
				totalRecipients,
				totalStaff,
				totalAdmins,
				totalDonations,
				totalInventoryItems,
			},
			requests: {
				pending: pendingRecipientRequests,
				approved: approvedRecipientRequests,
				fulfilled: fulfilledRecipientRequests,
			},
		};
	},

	async calculateVettingSummary() {
		const [pending, approved, rejected, total] = await Promise.all([
			VettingRequest.countDocuments({ vettingStatus: 'pending' }),
			VettingRequest.countDocuments({ vettingStatus: 'approved' }),
			VettingRequest.countDocuments({ vettingStatus: 'rejected' }),
			VettingRequest.countDocuments({}),
		]);

		return {
			total,
			pending,
			approved,
			rejected,
		};
	},

	async calculateRequestsSummary() {
		const [pending, approved, rejected, fulfilled, total] = await Promise.all([
			RecipientRequest.countDocuments({ status: 'pending' }),
			RecipientRequest.countDocuments({ status: 'approved' }),
			RecipientRequest.countDocuments({ status: 'rejected' }),
			RecipientRequest.countDocuments({ status: 'fulfilled' }),
			RecipientRequest.countDocuments({}),
		]);

		return {
			total,
			pending,
			approved,
			rejected,
			fulfilled,
		};
	},

	async getDashboard() {
		return module.exports.calculateStats();
	},
};
