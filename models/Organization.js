const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  githubId: {
    type: Number,
    required: true,
    unique: true
  },
  login: {
    type: String,
    required: true
  },
  node_id: {
    type: String
  },
  url: {
    type: String
  },
  repos_url: {
    type: String
  },
  events_url: {
    type: String
  },
  hooks_url: {
    type: String
  },
  issues_url: {
    type: String
  },
  members_url: {
    type: String
  },
  public_members_url: {
    type: String
  },
  description: {
    type: String
  },
  avatarUrl: {
    type: String
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization; 