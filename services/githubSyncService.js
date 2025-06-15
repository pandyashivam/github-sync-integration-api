const axios = require('axios');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Repository = require('../models/Repository');
const Commit = require('../models/Commit');
const PullRequest = require('../models/PullRequest');
const Issue = require('../models/Issue');
const IssueHistory = require('../models/IssueHistory');
const OrganizationUser = require('../models/OrganizationUser');
const mongoose = require('mongoose');

class GithubSyncService {
  constructor(userId) {
    this.userId = userId;
    this.user = null;
    this.accessToken = null;
    this.PER_PAGE = 100;
  }

  async initialize() {
    try {
      this.user = await User.findById(this.userId);
      if (!this.user) {
        throw new Error('User not found');
      }
      
      this.accessToken = this.user.githubAccessToken;
      return true;
    } catch (error) {
      console.error('Error initializing GitHub sync:', error);
      return false;
    }
  }

  async startSync() {
    try {
      if (!this.user || !this.accessToken) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize sync');
        }
      }

      console.log(`Starting GitHub sync for user ${this.userId}`);
      
      this.user.isSyncInProgress = true;
      await this.user.save();

      await this.syncOrganizations();
      await this.syncOrganizationRepositories();
      await this.syncOrganizationCommits();
      await this.syncOrganizationPullRequests();
      await this.syncOrganizationIssues();
      await this.syncOrganizationUsers();

      await this.fetchOpenSourceRepoData(); 
      
      this.user.isSyncInProgress = false;
      this.user.LastSynced = new Date();
      await this.user.save();
      
      console.log(`GitHub sync completed for user ${this.userId}`);
      
      return true;
    } catch (error) {
      console.error('Error during GitHub sync:', error);
      this.user.isSyncInProgress = false;
      await this.user.save();
      
      return false;
    }
  }

  async syncOrganizations() {
    try {
      console.log(`Starting organizations sync`);
      
      let orgResponse;
      try {
        orgResponse = await axios({
          method: 'GET',
          url: 'https://api.github.com/user/orgs',
          headers: {
            Authorization: `token ${this.accessToken}`,
            Accept: 'application/vnd.github.v3+json' 
          },
          params: {
            per_page: this.PER_PAGE
          }
        });
        
        const organizations = orgResponse.data;
        console.log(`Found ${organizations.length} organizations`);
        
        for (const org of organizations) {
          try {
            const detailedOrgResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/orgs/${org.login}`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              }
            });
            
            const orgData = detailedOrgResponse.data;
            
            await Organization.findOneAndUpdate(
              { githubId: orgData.id, userId: this.userId },
              {
                name: orgData.login,
                login: orgData.login,
                githubId: orgData.id,
                node_id: orgData.node_id,
                url: orgData.url,
                repos_url: orgData.repos_url,
                events_url: orgData.events_url,
                hooks_url: orgData.hooks_url,
                issues_url: orgData.issues_url,
                members_url: orgData.members_url,
                public_members_url: orgData.public_members_url,
                avatarUrl: orgData.avatar_url,
                description: orgData.description,
                userId: this.userId
              },
              { upsert: true, new: true }
            );
            
            console.log(`Successfully processed organization: ${org.login}`);
          } catch (error) {
            console.error(`Error processing organization ${org.login}:`, error.message);
            if (error.response) {
              console.error(`Status: ${error.response.status}, Data:`, error.response.data);
            }
          }
        }
        
        console.log(`Organizations sync completed`);
      } catch (error) {
        console.error(`Error fetching organizations:`, error.message);
        if (error.response) {
          console.error(`Status: ${error.response.status}, Data:`, error.response.data);
        }
      }
    } catch (error) {
      console.error('Error in syncOrganizations:', error);
    }
  }

  async syncOrganizationRepositories() {
    try {
      console.log(`Starting organization repositories sync`);
      
      const organizations = await Organization.find({ userId: this.userId });
      
      for (const org of organizations) {
        let page = 1;
        let hasMoreRepos = true;
        
        while (hasMoreRepos) {
          try {
            const reposResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/orgs/${org.name}/repos`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              },
              params: {
                per_page: this.PER_PAGE,
                page: page,
                type: 'all'
              }
            });

            const repos = reposResponse.data;
            console.log(`Retrieved ${repos.length} repos from org ${org.name}, page ${page}`);
            
            if (repos.length < this.PER_PAGE) {
              hasMoreRepos = false;
            }
            
            for (const repo of repos) {
              await Repository.findOneAndUpdate(
                { repoId: repo.id, userId: this.userId },
                {
                  name: repo.name,
                  repoId: repo.id,
                  node_id: repo.node_id,
                  fullName: repo.full_name,
                  description: repo.description,
                  url: repo.url,
                  owner: {
                    login: repo.owner.login,
                    id: repo.owner.id,
                    avatar_url: repo.owner.avatar_url,
                    url: repo.owner.url,
                    type: repo.owner.type
                  },
                  created_at: repo.created_at,
                  updated_at: repo.updated_at,
                  pushed_at: repo.pushed_at,
                  userId: this.userId,
                  organizationId: org._id,
                  isPrivate: repo.private
                },
                { upsert: true, new: true }
              );
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`Error fetching repos for org ${org.name}, page ${page}:`, error.message);
            if (error.response) {
              console.error(`Status: ${error.response.status}, Data:`, error.response.data);
            }
            hasMoreRepos = false;
          }
        }
      }
      
      console.log(`Organization repositories sync completed`);
    } catch (error) {
      console.error('Error in syncOrganizationRepositories:', error);
    }
  }

  async syncOrganizationCommits() {
    try {
      console.log(`Starting organization commits sync`);
      
      const repositories = await Repository.find({ 
        userId: this.userId,
        organizationId: { $exists: true }
      });
      
      for (const repo of repositories) {
        let page = 1;
        let hasMoreCommits = true;
        
        while (hasMoreCommits) {
          try {
            const commitsResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/repos/${repo.fullName}/commits`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              },
              params: {
                per_page: this.PER_PAGE,
                page: page
              }
            });

            const commits = commitsResponse.data;
            console.log(`Retrieved ${commits.length} commits from repo ${repo.name}, page ${page}`);
            
            if (commits.length < this.PER_PAGE) {
              hasMoreCommits = false;
            }
            
            for (const commit of commits) {
              await Commit.findOneAndUpdate(
                { sha: commit.sha, userId: this.userId },
                {
                  sha: commit.sha,
                  commit: {
                    author: {
                      name: commit.commit.author?.name,
                      email: commit.commit.author?.email,
                      date: commit.commit.author?.date
                    },
                    committer: {
                      name: commit.commit.committer?.name,
                      email: commit.commit.committer?.email,
                      date: commit.commit.committer?.date
                    },
                    message: commit.commit.message,
                    tree: {
                      sha: commit.commit.tree?.sha,
                      url: commit.commit.tree?.url
                    },
                    url: commit.commit.url,
                    comment_count: commit.commit.comment_count,
                    verification: {
                      verified: commit.commit.verification?.verified,
                      reason: commit.commit.verification?.reason,
                      verified_at: commit.commit.verification?.verified_at
                    }
                  },
                  author: commit.author ? {
                    login: commit.author.login,
                    id: commit.author.id,
                    node_id: commit.author.node_id,
                    avatar_url: commit.author.avatar_url,
                    url: commit.author.url
                  } : null,
                  committer: commit.committer ? {
                    login: commit.committer.login,
                    id: commit.committer.id,
                    node_id: commit.committer.node_id,
                    avatar_url: commit.committer.avatar_url,
                    url: commit.committer.url
                  } : null,
                  url: commit.html_url,
                  repositoryId: repo._id,
                  userId: this.userId
                },
                { upsert: true, new: true }
              );
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`Error fetching commits for ${repo.name}:`, error.message);
            if (error.response) {
              console.error(`Status: ${error.response.status}, Data:`, error.response.data);
            }
            hasMoreCommits = false;
          }
        }
      }
     
      console.log(`Organization commits sync completed`);
    } catch (error) {
      console.error('Error in syncOrganizationCommits:', error);
    }
  }

  async syncOrganizationPullRequests() {
    try {
      console.log(`Starting organization pull requests sync`);
      
      const repositories = await Repository.find({ 
        userId: this.userId,
        organizationId: { $exists: true }
      });
      
      for (const repo of repositories) {
        let page = 1;
        let hasMorePulls = true;
        
        while (hasMorePulls) {
          try {
            const pullsResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/repos/${repo.fullName}/pulls`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              },
              params: {
                state: 'all',
                per_page: this.PER_PAGE,
                page: page
              }
            });

            const pulls = pullsResponse.data;
            console.log(`Retrieved ${pulls.length} PRs from repo ${repo.name}, page ${page}`);
            
            if (pulls.length < this.PER_PAGE) {
              hasMorePulls = false;
            }
            
            for (const pull of pulls) {
              await PullRequest.findOneAndUpdate(
                { githubId: pull.id, userId: this.userId },
                {
                  githubId: pull.id,
                  number: pull.number,
                  title: pull.title,
                  body: pull.body,
                  state: pull.state,
                  url: pull.url,
                  user: pull.user ? {
                    login: pull.user.login,
                    id: pull.user.id,
                    node_id: pull.user.node_id,
                    avatar_url: pull.user.avatar_url
                  } : null,
                  created_at: pull.created_at,
                  updated_at: pull.updated_at,
                  closed_at: pull.closed_at,
                  merged_at: pull.merged_at,
                  merge_commit_sha: pull.merge_commit_sha,
                  assignee: pull.assignee,
                  assignees: pull.assignees?.map(assignee => ({
                    id: assignee.id,
                    node_id: assignee.node_id,
                    url: assignee.url,
                    login: assignee.login,
                    avatar_url: assignee.avatar_url
                  })),
                  requested_reviewers: pull.requested_reviewers?.map(reviewer => ({
                    id: reviewer.id,
                    node_id: reviewer.node_id,
                    url: reviewer.url,
                    login: reviewer.login,
                    avatar_url: reviewer.avatar_url
                  })),
                  requested_teams: pull.requested_teams?.map(team => ({
                    id: team.id,
                    node_id: team.node_id,
                    url: team.url,
                    name: team.name
                  })),
                  labels: pull.labels?.map(label => ({
                    id: label.id,
                    node_id: label.node_id,
                    url: label.url,
                    name: label.name,
                    color: label.color,
                    default: label.default,
                    description: label.description
                  })),
                  repositoryId: repo._id,
                  userId: this.userId
                },
                { upsert: true, new: true }
              );
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`Error fetching pull requests for ${repo.name}:`, error.message);
            if (error.response) {
              console.error(`Status: ${error.response.status}, Data:`, error.response.data);
            }
            hasMorePulls = false;
          }
        }
      }
      
      console.log(`Organization pull requests sync completed`);
    } catch (error) {
      console.error('Error in syncOrganizationPullRequests:', error);
    }
  }

  async syncOrganizationIssues() {
    try {
      console.log(`Starting organization issues sync`);
      
      const repositories = await Repository.find({ 
        userId: this.userId,
        organizationId: { $exists: true }
      });
      
      for (const repo of repositories) {
        let page = 1;
        let hasMoreIssues = true;
        
        while (hasMoreIssues) {
          try {
            const issuesResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/repos/${repo.fullName}/issues`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              },
              params: {
                state: 'all',
                per_page: this.PER_PAGE,
                page: page,
                sort: 'created',
                direction: 'desc'
              }
            });

            const allIssues = issuesResponse.data;
            const issues = allIssues.filter(issue => !issue.pull_request);
            console.log(`Retrieved ${issues.length} issues from repo ${repo.name}, page ${page}`);
            
            if (allIssues.length < this.PER_PAGE) {
              hasMoreIssues = false;
            }
            
            for (const issue of issues) {
              const savedIssue = await Issue.findOneAndUpdate(
                { githubId: issue.id, userId: this.userId },
                {
                  githubId: issue.id,
                  url: issue.url,
                  repository_url: issue.repository_url,
                  labels_url: issue.labels_url,
                  node_id: issue.node_id,
                  number: issue.number,
                  title: issue.title,
                  user: issue.user ? {
                    login: issue.user.login,
                    id: issue.user.id,
                    node_id: issue.user.node_id,
                    avatar_url: issue.user.avatar_url
                  } : null,
                  labels: issue.labels?.map(label => ({
                    id: label.id,
                    node_id: label.node_id,
                    url: label.url,
                    name: label.name,
                    color: label.color,
                    default: label.default,
                    description: label.description
                  })),
                  state: issue.state,
                  created_at: issue.created_at,
                  updated_at: issue.updated_at,
                  author_association: issue.author_association,
                  type: issue.type,
                  draft: issue.draft,
                  pull_request: issue.pull_request ? {
                    url: issue.pull_request.url,
                    html_url: issue.pull_request.html_url,
                    diff_url: issue.pull_request.diff_url,
                    patch_url: issue.pull_request.patch_url,
                    merged_at: issue.pull_request.merged_at
                  } : null,
                  body: issue.body,
                  closed_at: issue.closed_at,
                  closed_by: issue.closed_by,
                  reactions: issue.reactions ? {
                    url: issue.reactions.url,
                    total_count: issue.reactions.total_count,
                    "+1": issue.reactions["+1"],
                    "-1": issue.reactions["-1"],
                    laugh: issue.reactions.laugh,
                    hooray: issue.reactions.hooray,
                    confused: issue.reactions.confused,
                    heart: issue.reactions.heart,
                    rocket: issue.reactions.rocket,
                    eyes: issue.reactions.eyes
                  } : null,
                  timeline_url: issue.timeline_url,
                  performed_via_github_app: issue.performed_via_github_app,
                  state_reason: issue.state_reason,
                  repositoryId: repo._id,
                  userId: this.userId
                },
                { upsert: true, new: true }
              );
              
              await this.syncIssueChangelogs(repo.fullName, issue.number, savedIssue._id, repo._id);
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`Error fetching issues for ${repo.name}:`, error.message);
            if (error.response) {
              console.error(`Status: ${error.response.status}, Data:`, error.response.data);
            }
            hasMoreIssues = false;
          }
        }
      }
      
      console.log(`Organization issues sync completed`);
    } catch (error) {
      console.error('Error in syncOrganizationIssues:', error);
    }
  }

  async syncIssueChangelogs(repoFullName, issueNumber, issueId, repoId) {
    try {
      console.log(`Fetching changelogs for issue #${issueNumber} in repo ${repoFullName}`);
  
      let page = 1;
      let hasMoreEvents = true;
      const issueObjectId = new mongoose.Types.ObjectId(issueId);
  
      while (hasMoreEvents) {
        try {
          const changelogResponse = await axios({
            method: 'GET',
            url: `https://api.github.com/repos/${repoFullName}/issues/${issueNumber}/events`,
            headers: {
              Authorization: `token ${this.accessToken}`,
              Accept: 'application/vnd.github.v3+json'
            },
            params: {
              per_page: this.PER_PAGE,
              page: page
            }
          });
  
          const events = changelogResponse.data;
  
          if (events.length < this.PER_PAGE) {
            hasMoreEvents = false;
          }

          // Prepare bulk operations
          const bulkOps = events.map(event => ({
            updateOne: {
              filter: { githubId: event.id, userId: this.userId },
              update: {
                $set: {
                  githubId: event.id,
                  node_id: event.node_id,
                  url: event.url,
                  actor: event.actor ? {
                    login: event.actor.login,
                    id: event.actor.id,
                    node_id: event.actor.node_id,
                    avatar_url: event.actor.avatar_url,
                    url: event.actor.url
                  } : null,
                  event: event.event,
                  commit_id: event.commit_id,
                  commit_url: event.commit_url,
                  created_at: event.created_at,
                  label: event.label ? {
                    name: event.label.name,
                    color: event.label.color
                  } : null,
                  assignee: event.assignee,
                  milestone: event.milestone,
                  rename: event.rename,
                  issueId: issueObjectId,
                  repositoryId: repoId,
                  userId: this.userId
                }
              },
              upsert: true
            }
          }));
  
          if (bulkOps.length > 0) {
            await IssueHistory.bulkWrite(bulkOps);
          }
  
          page++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error fetching events for issue #${issueNumber}:`, error.message);
          if (error.response) {
            console.error(`Status: ${error.response.status}, Data:`, error.response.data);
          }
          hasMoreEvents = false;
        }
      }
    } catch (error) {
      console.error(`Error syncing events for issue #${issueNumber}:`, error);
    }
  }

  async syncOrganizationUsers() {
    try {
      console.log(`Starting organization users sync`);
      
      const organizations = await Organization.find({ userId: this.userId });
      
      for (const org of organizations) {
        let page = 1;
        let hasMoreUsers = true;
        
        while (hasMoreUsers) {
          try {
            const usersResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/orgs/${org.name}/members`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              },
              params: {
                per_page: this.PER_PAGE,
                page: page
              }
            });

            const users = usersResponse.data;
            console.log(`Retrieved ${users.length} users from org ${org.name}, page ${page}`);
            
            if (users.length < this.PER_PAGE) {
              hasMoreUsers = false;
            }
            
            for (const user of users) {
              await OrganizationUser.findOneAndUpdate(
                { 
                  githubId: user.id, 
                  organizationId: org._id,
                  userId: this.userId 
                },
                {
                  githubId: user.id,
                  login: user.login,
                  node_id: user.node_id,
                  avatar_url: user.avatar_url,
                  url: user.url,
                  organizationId: org._id,
                  userId: this.userId
                },
                { upsert: true, new: true }
              );
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`Error fetching users for org ${org.name}:`, error.message);
            if (error.response) {
              console.error(`Status: ${error.response.status}, Data:`, error.response.data);
            }
            hasMoreUsers = false;
          }
        }
      }
      
      console.log(`Organization users sync completed`);
    } catch (error) {
      console.error('Error in syncOrganizationUsers:', error);
    }
  }

  async fetchOpenSourceRepoData() {
    try {
      console.log(`Starting open source repositories sync`);
      
      const openSourceRepos = [
        { owner: 'nodejs', repo: 'node' },      
        { owner: 'nestjs', repo: 'nest' }, 
        { owner: 'microsoft', repo: 'vscode' },
      ];

      let openSourceOrg = await Organization.findOne({ 
        name: 'OpenSource', 
        userId: this.userId 
      });
      
      if (!openSourceOrg) {
        openSourceOrg = await Organization.create({
          name: 'OpenSource',
          login: 'OpenSource',
          githubId: 0,
          url: 'https://github.com',
          description: 'Collection of open source repositories',
          avatarUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
          userId: this.userId
        });
      }

      for (const { owner, repo } of openSourceRepos) {
        try {
          console.log(`Fetching ${owner}/${repo}`);
          const headers = {
            Authorization: `token ${this.accessToken || process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json'
          };

          // Fetch repo details
          const repoResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, { headers });
          const repoData = repoResponse.data;
          
          let existingRepo = await Repository.findOne({ 
            repoId: repoData.id,
            userId: this.userId 
          });
          
          if (!existingRepo) {
            existingRepo = await Repository.create({
              name: repoData.name,
              repoId: repoData.id,
              node_id: repoData.node_id,
              fullName: repoData.full_name,
              description: repoData.description,
              url: repoData.url,
              owner: {
                login: repoData.owner.login,
                id: repoData.owner.id,
                avatar_url: repoData.owner.avatar_url,
                url: repoData.owner.url,
                type: repoData.owner.type
              },
              created_at: repoData.created_at,
              updated_at: repoData.updated_at,
              pushed_at: repoData.pushed_at,
              userId: this.userId,
              organizationId: openSourceOrg._id,
              isPrivate: repoData.private
            });
            
            console.log(`Created repository: ${repoData.full_name}`);
          } else {
            console.log(`Repository already exists: ${repoData.full_name}`);
          }

          // Fetch contributors/members
          await this.fetchOpenSourceRepoMembers(owner, repo, openSourceOrg._id);

          // Fetch pull requests
          let page = 1;
          let hasMorePRs = true;
          
          while (hasMorePRs) {
            const pullsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
              headers,
              params: { 
                state: 'all', 
                per_page: this.PER_PAGE, 
                page: page 
              }
            });
            
            const pulls = pullsResponse.data;
            console.log(`PRs fetched (page ${page}): ${pulls.length}`);
            
            if (pulls.length < this.PER_PAGE) {
              hasMorePRs = false;
            }
            
            for (const pull of pulls) {
              // const existingPRCount = await PullRequest.countDocuments({
              //   userId: this.userId
              // });

              // if (existingPRCount >= 1000) {
              //   console.log(`Skipping sync: Already ${existingPRCount} PRs exist for`);
              //   hasMorePRs = false;
              //   break;
              // }

              const existingPR = await PullRequest.findOne({ 
                githubId: pull.id,
                userId: this.userId 
              });
              
              if (!existingPR) {
                await PullRequest.create({
                  githubId: pull.id,
                  number: pull.number,
                  title: pull.title,
                  body: pull.body,
                  state: pull.state,
                  url: pull.url,
                  user: pull.user ? {
                    login: pull.user.login,
                    id: pull.user.id,
                    node_id: pull.user.node_id,
                    avatar_url: pull.user.avatar_url
                  } : null,
                  created_at: pull.created_at,
                  updated_at: pull.updated_at,
                  closed_at: pull.closed_at,
                  merged_at: pull.merged_at,
                  merge_commit_sha: pull.merge_commit_sha,
                  assignee: pull.assignee,
                  assignees: pull.assignees?.map(assignee => ({
                    id: assignee.id,
                    node_id: assignee.node_id,
                    url: assignee.url,
                    login: assignee.login,
                    avatar_url: assignee.avatar_url
                  })),
                  requested_reviewers: pull.requested_reviewers?.map(reviewer => ({
                    id: reviewer.id,
                    node_id: reviewer.node_id,
                    url: reviewer.url,
                    login: reviewer.login,
                    avatar_url: reviewer.avatar_url
                  })),
                  requested_teams: pull.requested_teams?.map(team => ({
                    id: team.id,
                    node_id: team.node_id,
                    url: team.url,
                    name: team.name
                  })),
                  labels: pull.labels?.map(label => ({
                    id: label.id,
                    node_id: label.node_id,
                    url: label.url,
                    name: label.name,
                    color: label.color,
                    default: label.default,
                    description: label.description
                  })),
                  repositoryId: existingRepo._id,
                  userId: this.userId
                });
              }
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Fetch issues
          page = 1;
          let hasMoreIssues = true;
          
          while (hasMoreIssues) {
            const issuesResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues`, {
              headers,
              params: { 
                state: 'all', 
                per_page: this.PER_PAGE, 
                page: page 
              }
            });
            
            const issues = issuesResponse.data;
            console.log(`Issues fetched (page ${page}): ${issues.length}`);
            
            if (issues.length < this.PER_PAGE) {
              hasMoreIssues = false;
            }
            
            for (const issue of issues) {
              if (issue.pull_request) continue;

              // const existingIssueCount = await Issue.countDocuments({
              //   userId: this.userId
              // });

              // if (existingIssueCount >= 600) {
              //   console.log(`Skipping sync: Already ${existingIssueCount} issues exist for`);
              //   hasMoreIssues = false;
              //   break;
              // }
              
              const existingIssue = await Issue.findOne({ 
                githubId: issue.id,
                userId: this.userId 
              });
              
              if (!existingIssue) {
                await Issue.create({
                  githubId: issue.id,
                  url: issue.url,
                  repository_url: issue.repository_url,
                  labels_url: issue.labels_url,
                  node_id: issue.node_id,
                  number: issue.number,
                  title: issue.title,
                  user: issue.user ? {
                    login: issue.user.login,
                    id: issue.user.id,
                    node_id: issue.user.node_id,
                    avatar_url: issue.user.avatar_url
                  } : null,
                  labels: issue.labels?.map(label => ({
                    id: label.id,
                    node_id: label.node_id,
                    url: label.url,
                    name: label.name,
                    color: label.color,
                    default: label.default,
                    description: label.description
                  })),
                  state: issue.state,
                  created_at: issue.created_at,
                  updated_at: issue.updated_at,
                  author_association: issue.author_association,
                  type: issue.type,
                  draft: issue.draft,
                  pull_request: issue.pull_request ? {
                    url: issue.pull_request.url,
                    html_url: issue.pull_request.html_url,
                    diff_url: issue.pull_request.diff_url,
                    patch_url: issue.pull_request.patch_url,
                    merged_at: issue.pull_request.merged_at
                  } : null,
                  body: issue.body,
                  closed_at: issue.closed_at,
                  closed_by: issue.closed_by,
                  reactions: issue.reactions ? {
                    url: issue.reactions.url,
                    total_count: issue.reactions.total_count,
                    "+1": issue.reactions["+1"],
                    "-1": issue.reactions["-1"],
                    laugh: issue.reactions.laugh,
                    hooray: issue.reactions.hooray,
                    confused: issue.reactions.confused,
                    heart: issue.reactions.heart,
                    rocket: issue.reactions.rocket,
                    eyes: issue.reactions.eyes
                  } : null,
                  timeline_url: issue.timeline_url,
                  performed_via_github_app: issue.performed_via_github_app,
                  state_reason: issue.state_reason,
                  repositoryId: existingRepo._id,
                  userId: this.userId
                });
                
                await this.syncIssueChangelogs(
                  `${owner}/${repo}`, 
                  issue.number, 
                  issue.id, 
                  existingRepo._id
                );
              }
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          console.log(`Successfully processed ${owner}/${repo}`);

        } catch (err) {
          console.error(`Failed to fetch ${owner}/${repo}:`, err.response?.data || err.message);
        }
      }
      
      console.log(`Open source repositories sync completed`);
      return true;
    } catch (error) {
      console.error('Error in fetchOpenSourceRepoData:', error);
      return false;
    }
  }

  async fetchOpenSourceRepoMembers(owner, repo, organizationId) {
    try {
      console.log(`Fetching contributors for ${owner}/${repo}`);
      
      let page = 1;
      let hasMoreContributors = true;
      
      while (hasMoreContributors) {
        try {
          const headers = {
            Authorization: `token ${this.accessToken || process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json'
          };
          
          const contributorsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
            headers,
            params: { 
              per_page: this.PER_PAGE, 
              page: page 
            }
          });
          
          const contributors = contributorsResponse.data;
          console.log(`Retrieved ${contributors.length} contributors from repo ${owner}/${repo}, page ${page}`);
          
          if (contributors.length < this.PER_PAGE) {
            hasMoreContributors = false;
          }
          
          for (const contributor of contributors) {
            // For each contributor, fetch detailed user info
            try {
              const userResponse = await axios.get(`https://api.github.com/users/${contributor.login}`, { headers });
              const userData = userResponse.data;
              
              await OrganizationUser.findOneAndUpdate(
                { 
                  githubId: userData.id, 
                  organizationId: organizationId,
                  userId: this.userId 
                },
                {
                  githubId: userData.id,
                  login: userData.login,
                  node_id: userData.node_id,
                  avatar_url: userData.avatar_url,
                  url: userData.url,
                  organizationId: organizationId,
                  userId: this.userId
                },
                { upsert: true, new: true }
              );
              
              console.log(`Added contributor: ${userData.login}`);
              
              // Rate limiting - pause between user requests
              await new Promise(resolve => setTimeout(resolve, 500));
              
            } catch (userError) {
              console.error(`Error fetching user ${contributor.login}:`, userError.message);
              if (userError.response && userError.response.status === 403) {
                console.error('Rate limit likely exceeded, pausing...');
                await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
              }
            }
          }
          
          page++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`Error fetching contributors for ${owner}/${repo}:`, error.message);
          if (error.response) {
            console.error(`Status: ${error.response.status}, Data:`, error.response.data);
          }
          hasMoreContributors = false;
        }
      }
      
      console.log(`Completed fetching contributors for ${owner}/${repo}`);
    } catch (error) {
      console.error(`Error in fetchOpenSourceRepoMembers for ${owner}/${repo}:`, error);
    }
  }

  static async getSyncStatus() {
    try {
      const users = await User.find();
      if (!users) {
        return { error: 'Users not found' };
      }

      const syncStatus = users.map(user => {
        return {
          isSyncInProgress: user.isSyncInProgress,
          lastSynced: user.LastSynced,
          syncType: user.LastSyncedType,
          userId: user._id
        };
      });

      return syncStatus;
    } catch (error) {
      console.error('Error getting sync status:', error);
      return { error: error.message };
    }
  }
}

module.exports = GithubSyncService; 