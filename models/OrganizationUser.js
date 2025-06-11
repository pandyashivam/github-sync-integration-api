const mongoose = require('mongoose');

const organizationUserSchema = new mongoose.Schema({
  githubId: {
    type: Number,
    required: true
  },
  login: {
    type: String,
    required: true
  },
  avatarUrl: {
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
  }
}, {
  timestamps: true
});

// Compound index to ensure uniqueness of user within an organization for a specific user
organizationUserSchema.index({ githubId: 1, organizationId: 1, userId: 1 }, { unique: true });

const OrganizationUser = mongoose.model('OrganizationUser', organizationUserSchema);

module.exports = OrganizationUser; 