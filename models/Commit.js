const mongoose = require('mongoose');

const commitSchema = new mongoose.Schema({
  sha: {
    type: String,
    required: true,
    unique: true
  },
  message: {
    type: String,
    required: true
  },
  url: {
    type: String
  },
  authorName: {
    type: String
  },
  authorEmail: {
    type: String
  },
  authorDate: {
    type: Date
  },
  committerName: {
    type: String
  },
  committerEmail: {
    type: String
  },
  committedDate: {
    type: Date
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