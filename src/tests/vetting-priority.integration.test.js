const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { initializeGlobalMongo, cleanupGlobalMongo, isSetupComplete } = require('./globalSetup');
const { resetIntegrationMongo, supportsTransactions } = require('./integrationMongoSetup');
const vettingRequestService = require('../services/vettingRequestService');

const User = require('../models/userModel');
const VettingRequest = require('../models/vettingRequestModel');
const RecipientPoints = require('../models/recipientPointsModel');
const RecipientPriority = require('../models/recipientPriorityModel');

const state = {
	dbAvailable: false,
};

test.before(async () => {
	try {
		await initializeGlobalMongo();
		state.dbAvailable = isSetupComplete();
	} catch (error) {
		console.error('[Test] Failed to initialize MongoDB:', error.message);
		state.dbAvailable = false;
	}
});

test.after(async () => {
	if (!state.dbAvailable) {
		return;
	}

	await cleanupGlobalMongo();
});

test.beforeEach(async () => {
	if (!state.dbAvailable) {
		return;
	}

	await resetIntegrationMongo();
});

test('vetting approval creates recipient points and priority record', async (t) => {
	if (!state.dbAvailable) {
		t.skip('MongoDB server is not available for integration testing');
		return;
	}

	if (!supportsTransactions()) {
		t.skip('MongoDB transactions require replica set support');
		return;
	}

	const recipient = await User.create({
		role: 'Recipient',
		name: 'Vetting Recipient',
		email: `vetting-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
		passwordHash: 'StrongPassword123',
		phoneNumber: '01011112222',
		address: 'Cairo',
		vettingStatus: 'pending',
		accountStatus: 'active',
	});

	const vettingRequest = await VettingRequest.create({
		recipientUserID: recipient._id,
		nationalID: `${Math.floor(10000000000000 + Math.random() * 90000000000000)}`.slice(0, 14),
		jobTitle: 'Teacher',
		monthlyIncome: 1200,
		familyMembers: 4,
		healthStatus: 'medium',
		documentsURL: 'https://example.com/evidence.pdf',
		vettingStatus: 'pending',
	});

	const approved = await vettingRequestService.approveRequest(vettingRequest._id, new mongoose.Types.ObjectId());
	assert.equal(approved.vettingStatus, 'approved');

	const updatedUser = await User.findById(recipient._id).lean();
	assert.equal(updatedUser.vettingStatus, 'approved');

	const points = await RecipientPoints.findOne({ recipientUserID: recipient._id }).lean();
	assert.ok(points);
	assert.equal(points.currentPoints, points.monthlyAllocation);

	const priority = await RecipientPriority.findOne({ recipientUserID: recipient._id }).lean();
	assert.ok(priority);
	assert.ok(priority.finalScore >= 1);
	assert.ok(priority.finalScore <= 10);
});
