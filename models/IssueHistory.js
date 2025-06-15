const mongoose = require('mongoose');

const issueHistorySchema = new mongoose.Schema({
  githubId: {
    type: Number,
    required: true,
    unique: true
  },
  node_id: {
    type: String
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
    node_id: {
      type: String
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
  commit_id: {
    type: String
  },
  commit_url: {
    type: String
  },
  created_at: {
    type: Date
  },
  label: {
    name: {
      type: String
    },
    color: {
      type: String
    }
  },
  assignee: {
    type: mongoose.Schema.Types.Mixed
  },
  milestone: {
    type: mongoose.Schema.Types.Mixed
  },
  rename: {
    type: mongoose.Schema.Types.Mixed
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
  }
}, {
  timestamps: true
});

const IssueHistory = mongoose.model('IssueHistory', issueHistorySchema);

module.exports = IssueHistory; 