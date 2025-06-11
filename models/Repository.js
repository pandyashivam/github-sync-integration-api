const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  githubId: {
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