const express = require('express');
const authController = require('../controller/authController');

const router = express.Router();

router.get('/github', authController.githubAuth);
router.get('/github/callback', authController.githubCallback);

router.delete('/github/user/:userId', authController.removeGithubUser);
router.post('/github/sync/:userId', authController.syncGithubUser);

module.exports = router; 