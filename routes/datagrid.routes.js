const express = require('express');
const datagridController = require('../controller/datagridController');

const router = express.Router();

router.get('/users', datagridController.getAllUsers);
router.get('/models', datagridController.getAllAvailableModels);
router.get('/data/:modelName', datagridController.getModelData);
router.get('/user-details/:assigneeId/:modelName', datagridController.getUserDetails);

module.exports = router; 