const User = require('../models/User');
const GithubSyncService = require('../services/githubSyncService');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({});
    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
}; 

exports.getUserSyncStatus = async (req, res) => {
  try {
    const syncStatus = await GithubSyncService.getSyncStatus();
    
    if (syncStatus.error) {
      return res.status(404).json({
        success: false,
        message: syncStatus.error
      });
    }
    
    res.status(200).json({
      success: true,
      data: syncStatus
    });
  } catch (error) {
    console.error('Error fetching user sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

exports.syncOpenSourceRepos = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (user.isSyncInProgress) {
      return res.status(400).json({
        success: false,
        message: 'Sync is already in progress for this user'
      });
    }
    
    // Update user status
    user.isSyncInProgress = true;
    await user.save();
    
    // Initialize sync service
    const syncService = new GithubSyncService(userId);
    await syncService.initialize();
    
    // Execute open source repo fetch in background
    syncService.fetchOpenSourceRepoData()
      .then(async () => {
        user.isSyncInProgress = false;
        user.LastSynced = new Date();
        await user.save();
        console.log(`Open source repo sync completed for user ${userId}`);
      })
      .catch(async (error) => {
        user.isSyncInProgress = false;
        await user.save();
        console.error(`Error in open source repo sync for user ${userId}:`, error);
      });
    
    // Respond immediately
    res.status(200).json({
      success: true,
      message: 'Open source repository sync initiated'
    });
  } catch (error) {
    console.error('Error syncing open source repos:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};