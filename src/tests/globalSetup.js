/**
 * Global setup for integration tests.
 * This runs once before all test files are executed, ensuring MongoDB replica set
 * is initialized once and cached for subsequent test runs.
 */

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let globalReplSet = null;
let setupComplete = false;

const initializeGlobalMongo = async () => {
	if (setupComplete && mongoose.connection.readyState === 1) {
		return;
	}

	try {
		console.log('[GlobalSetup] Initializing MongoMemoryReplSet...');
		globalReplSet = await MongoMemoryReplSet.create({
			replSet: {
				count: 1,
				storageEngine: 'wiredTiger',
				name: 'rs0',
			},
		});

		const uri = globalReplSet.getUri();
		console.log('[GlobalSetup] Connecting to MongoDB:', uri);

		await mongoose.connect(uri, {
			serverSelectionTimeoutMS: 10000,
		});

		setupComplete = true;
		console.log('[GlobalSetup] MongoDB replica set ready');
	} catch (error) {
		console.error('[GlobalSetup] Failed to initialize MongoDB:', error.message);
		throw error;
	}
};

const cleanupGlobalMongo = async () => {
	try {
		if (mongoose.connection.readyState !== 0) {
			await mongoose.disconnect();
		}

		if (globalReplSet) {
			console.log('[GlobalSetup] Stopping MongoDB replica set');
			await globalReplSet.stop();
			globalReplSet = null;
		}

		setupComplete = false;
	} catch (error) {
		console.error('[GlobalSetup] Error during cleanup:', error.message);
	}
};

const getGlobalUri = () => {
	if (!globalReplSet) {
		throw new Error('Global MongoDB not initialized. Call initializeGlobalMongo first.');
	}

	return globalReplSet.getUri();
};

const isSetupComplete = () => setupComplete;

module.exports = {
	initializeGlobalMongo,
	cleanupGlobalMongo,
	getGlobalUri,
	isSetupComplete,
};
