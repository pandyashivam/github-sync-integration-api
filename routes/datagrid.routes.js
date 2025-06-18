const express = require('express');
const datagridController = require('../controller/datagridController');

const router = express.Router();

router.get('/users', datagridController.getAllUsers);
router.get('/models', datagridController.getAllAvailableModels);
router.get('/data/:modelName', datagridController.getModelData);
router.get('/user-details/:assigneeId/:modelName', datagridController.getUserDetails);
router.get('/global-search/:userId', datagridController.searchAcrossAllCollections);
router.get('/relational-data/:userId', datagridController.getRelationalData);
router.get('/repositories/:userId', datagridController.getUserRepositories);

module.exports = router; 