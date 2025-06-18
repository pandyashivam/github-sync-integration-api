const mongoose = require('mongoose');

const issueHistorySchema = new mongoose.Schema({
  githubId: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    unique: true
  },
  url: {
    type: String
  },
  actor: {
    login: {
      type: String
    },
    id: {
      type: Number
    },
    avatar_url: {
      type: String
    },
    url: {
      type: String
    }
  },
  event: {
    type: String,
    required: true
  },
  created_at: {
    type: Date
  },
  githubIssueId: {
    type: Number
  },
  issueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Issue',
    required: true
  },
  repositoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repository',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Standardized fields for better display in AG Grid
  summary: {
    type: String,
    description: 'Human-readable summary of the event'
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Standardized event details'
  }
}, {
  timestamps: true
});

const IssueHistory = mongoose.model('IssueHistory', issueHistorySchema);

module.exports = IssueHistory; 