const mongoose = require('mongoose');
const config = require('../config/appConfig');

const activeJobs = Object.freeze(['monthly_points_reset', 'priority_recalculation']);

const getSystemSnapshot = () => ({
	uptime: Math.round(process.uptime()),
	serverStatus: 'running',
	dbStatus:
		mongoose.connection.readyState === 1
			? 'connected'
			: mongoose.connection.readyState === 2
				? 'connecting'
				: 'disconnected',
	memory: process.memoryUsage(),
});

const buildStatusPayload = () => ({
	...getSystemSnapshot(),
	nodeEnv: config.env,
	activeJobs,
});

module.exports = {
	getSystemSnapshot,
	buildStatusPayload,
	activeJobs,
};