const mongoose = require('mongoose');

const commitSchema = new mongoose.Schema({
  sha: {
    type: String,
    required: true,
    unique: true
  },
  commit: {
    author: {
      name: {
        type: String
      },
      email: {
        type: String
      },
      date: {
        type: Date
      }
    },
    committer: {
      name: {
        type: String
      },
      email: {
        type: String
      },
      date: {
        type: Date
      }
    },
    message: {
      type: String,
      required: true
    },
    tree: {
      sha: {
        type: String
      },
      url: {
        type: String
      }
    },
    url: {
      type: String
    },
    comment_count: {
      type: Number
    },
    verification: {
      verified: {
        type: Boolean
      },
      reason: {
        type: String
      },
      verified_at: {
        type: Date
      }
    }
  },
  author: {
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
  committer: {
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
  url: {
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

const Commit = mongoose.model('Commit', commitSchema);

module.exports = Commit; 