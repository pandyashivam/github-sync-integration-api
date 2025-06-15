const User = require('../models/User');
const axios = require('axios');
const GithubSyncService = require('../services/githubSyncService');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

exports.githubAuth = (req, res) => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=repo%20read:org%20user`;
  res.redirect(githubAuthUrl);
};


exports.githubCallback = async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).json({ message: 'Authorization code not provided' });
  }

  try {
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI
      },
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;
    
    if (!accessToken) {
      return res.status(400).json({ message: 'Failed to obtain access token' });
    }

    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    const githubName = userResponse.data.login;

    let user = await User.findOne({ githubName });
    if (!user) {
      user = new User({
        githubName,
        githubAccessToken: accessToken,
        LastSynced: null,
        LastSyncedType: 'full',
        isSyncInProgress: true
      });
    } else {
      user.githubAccessToken = accessToken;
      user.isSyncInProgress = true;
      user.LastSynced = new Date();
    }

    await user.save();
    
    const syncService = new GithubSyncService(new ObjectId(user._id));
    syncService.startSync().catch(error => {
      console.error('Error during background sync:', error);
    });

    res.redirect(`${process.env.FRONTEND_URL}/github/connect?auth=success`);
  } catch (error) {
    console.error('GitHub auth error:', error);
    res.status(500).json({ message: 'Authentication failed', error: error.message });
  }
};


exports.removeGithubUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
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
    
    const modelNames = Object.keys(mongoose.models).filter(model => 
      !model.startsWith('_')
    );
    
    const deletePromises = [];
    
    for (const modelName of modelNames) {
      if (modelName === 'User') continue;
      
      const Model = mongoose.models[modelName];
      if (Model.schema.paths.userId) {
        deletePromises.push(
          Model.deleteMany({ userId: new ObjectId(userId) })
        );
      }
    }
    
    const deleteResults = await Promise.allSettled(deletePromises);
    
    deleteResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Failed to delete data from ${modelNames[index]}:`, result.reason);
      }
    });
    
    await User.findByIdAndDelete(userId);
    
    return res.status(200).json({
      success: true,
      message: 'User and associated data successfully removed',
      userId
    });
    
  } catch (error) {
    console.error('Error removing GitHub user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove user',
      error: error.message
    });
  }
};

exports.syncGithubUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
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

    user.LastSynced = new Date();
    user.isSyncInProgress = true;
    await user.save();
    
    const syncService = new GithubSyncService(new ObjectId(user._id));
    syncService.startSync().catch(error => {
      console.error('Error during background sync:', error);
    });

    return res.status(200).json({
      success: true,
      message: 'GitHub sync initiated',
      userId
    });
    
  } catch (error) {
    console.error('Error syncing GitHub user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync user',
      error: error.message
    });
  }
};