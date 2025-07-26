const express = require('express');
const router = express.Router();
const timeEntryController = require('../controllers/timeEntryController');

router.get('/matters', timeEntryController.getMatters);
router.post('/time-entry', timeEntryController.createTimeEntry);

module.exports = router;