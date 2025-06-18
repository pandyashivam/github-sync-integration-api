const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  githubId: {
    type: Number,
    required: true,
    unique: true
  },
  url: {
    type: String
  },
  repository_url: {
    type: String
  },
  number: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
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
  state: {
    type: String,
    enum: ['open', 'closed'],
    required: true
  },
  created_at: {
    type: Date
  },
  author_association: {
    type: String
  },
  draft: {
    type: Boolean
  },
  pull_request: {
    url: {
      type: String
    },
    html_url: {
      type: String
    },
    diff_url: {
      type: String
    },
    patch_url: {
      type: String
    }
  },
  body: {
    type: String
  },
  closed_at: {
    type: Date
  },
  closed_by: {
    id: {
      type: Number
    },
    login: {
      type: String
    },
    avatar_url: {
      type: String
    }
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

const Issue = mongoose.model('Issue', issueSchema);

module.exports = Issue; 