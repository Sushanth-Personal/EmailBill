const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');

router.get('/emails', emailController.getEmails);
router.post('/summarize', emailController.summarizeEmail);

module.exports = router;