const mongoose = require('mongoose');

const pullRequestSchema = new mongoose.Schema({
  githubId: {
    type: Number,
    required: true,
    unique: true
  },
  number: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  body: {
    type: String
  },
  state: {
    type: String,
    enum: ['open', 'closed'],
    required: true
  },
  url: {
    type: String
  },
  user: {
    login: {
      type: String
    },
    id: {
      type: Number
    },
    avatar_url: {
      type: String
    }
  },
  created_at: {
    type: Date
  },
  closed_at: {
    type: Date
  },
  assignee: {
    login: {
      type: String
    },
    id: {
      type: Number
    },
    avatar_url: {
      type: String
    }
  },
  commits: [{
    sha: {
      type: String
    }
  }],
  labels: [{
    id: {
      type: Number
    },
    name: {
      type: String
    },
    color: {
      type: String
    },
    default: {
      type: Boolean
    },
    description: {
      type: String
    }
  }],
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

const PullRequest = mongoose.model('PullRequest', pullRequestSchema);

module.exports = PullRequest; 