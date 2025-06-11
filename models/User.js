const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  githubName: {
    type: String,
    required: true,
    unique: true
  },
  githubAccessToken: {
    type: String,
    required: true
  },
  LastSynced: {
    type: Date,
    default: null
  },
  LastSyncedType: {
    type: String,
    enum: ['full', 'partial'],
    default: 'full'
  },
  isSyncInProgress: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

module.exports = User; 