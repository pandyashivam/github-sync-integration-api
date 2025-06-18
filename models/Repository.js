const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  repoId: {
    type: Number,
    required: true,
    unique: true
  },
  fullName: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  url: {
    type: String
  },
  owner: {
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
    },
    type: {
      type: String
    }
  },
  created_at: {
    type: Date
  },
  updated_at: {
    type: Date
  },
  pushed_at: {
    type: Date
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPrivate: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const Repository = mongoose.model('Repository', repositorySchema);

module.exports = Repository; 