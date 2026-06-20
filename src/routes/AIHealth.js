const express = require('express');
const router = express.Router();
const { updateFamilyHealthAssessment } = require('../controllers/AIHealthAssessment');

router.post('/families/:familyId/health-assessment', updateFamilyHealthAssessment);

module.exports = router;

// In your main app.js / server.js:
//   app.use('/api', require('./routes/health.routes'));
