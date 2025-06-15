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
  labels_url: {
    type: String
  },
  node_id: {
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
    node_id: {
      type: String
    },
    avatar_url: {
      type: String
    }
  },
  labels: [{
    id: {
      type: Number
    },
    node_id: {
      type: String
    },
    url: {
      type: String
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
  updated_at: {
    type: Date
  },
  author_association: {
    type: String
  },
  type: {
    type: mongoose.Schema.Types.Mixed
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
    },
    merged_at: {
      type: Date
    }
  },
  body: {
    type: String
  },
  closed_at: {
    type: Date
  },
  closed_by: {
    type: mongoose.Schema.Types.Mixed
  },
  reactions: {
    url: {
      type: String
    },
    total_count: {
      type: Number
    },
    "+1": {
      type: Number
    },
    "-1": {
      type: Number
    },
    laugh: {
      type: Number
    },
    hooray: {
      type: Number
    },
    confused: {
      type: Number
    },
    heart: {
      type: Number
    },
    rocket: {
      type: Number
    },
    eyes: {
      type: Number
    }
  },
  timeline_url: {
    type: String
  },
  performed_via_github_app: {
    type: mongoose.Schema.Types.Mixed
  },
  state_reason: {
    type: String
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