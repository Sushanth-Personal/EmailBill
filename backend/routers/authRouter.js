const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);
router.get('/clio', authController.clioAuth);
router.get('/clio/callback', authController.clioCallback);

module.exports = router;