const express = require('express');
const userController = require('../controller/userController');

const router = express.Router();

router.get('/', userController.getAllUsers);
router.get('/sync-status', userController.getUserSyncStatus);

module.exports = router;