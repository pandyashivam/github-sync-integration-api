const axios = require('axios');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Repository = require('../models/Repository');
const Commit = require('../models/Commit');
const PullRequest = require('../models/PullRequest');
const Issue = require('../models/Issue');
const IssueComment = require('../models/IssueComment');
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
                githubId: orgData.id,
                url: orgData.html_url,
                description: orgData.description,
                avatarUrl: orgData.avatar_url,
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
                { githubId: repo.id, userId: this.userId },
                {
                  name: repo.name,
                  githubId: repo.id,
                  fullName: repo.full_name,
                  description: repo.description,
                  url: repo.html_url,
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
                  message: commit.commit.message,
                  url: commit.html_url,
                  authorName: commit.commit.author?.name,
                  authorEmail: commit.commit.author?.email,
                  authorDate: commit.commit.author?.date,
                  committerName: commit.commit.committer?.name,
                  committerEmail: commit.commit.committer?.email,
                  committedDate: commit.commit.committer?.date,
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
                  url: pull.html_url,
                  createdAt: pull.created_at,
                  updatedAt: pull.updated_at,
                  closedAt: pull.closed_at,
                  mergedAt: pull.merged_at,
                  authorLogin: pull.user?.login,
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
                  number: issue.number,
                  title: issue.title,
                  body: issue.body,
                  state: issue.state,
                  url: issue.html_url,
                  createdAt: issue.created_at,
                  updatedAt: issue.updated_at,
                  closedAt: issue.closed_at,
                  authorLogin: issue.user?.login,
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
      let hasMoreComments = true;
      const issueObjectId = new mongoose.Types.ObjectId(issueId);
  
      while (hasMoreComments) {
        try {
          const commentsResponse = await axios({
            method: 'GET',
            url: `https://api.github.com/repos/${repoFullName}/issues/${issueNumber}/comments`,
            headers: {
              Authorization: `token ${this.accessToken}`,
              Accept: 'application/vnd.github.v3+json'
            },
            params: {
              per_page: this.PER_PAGE,
              page: page
            }
          });
  
          const comments = commentsResponse.data;
  
          if (comments.length < this.PER_PAGE) {
            hasMoreComments = false;
          }

          const existingCommentCount = await IssueComment.countDocuments({
            userId: this.userId
          });
    
          if (existingCommentCount >= 600) {
            console.log(`Skipping sync: Already ${existingCommentCount} comments exist for`);
            hasMoreComments = false;
          }
  
          // Prepare bulk operations
          const bulkOps = comments.map(comment => ({
            updateOne: {
              filter: { githubId: comment.id, userId: this.userId },
              update: {
                $set: {
                  githubId: comment.id,
                  body: comment.body,
                  createdAt: comment.created_at,
                  updatedAt: comment.updated_at,
                  authorLogin: comment.user?.login,
                  issueId: issueObjectId,
                  repositoryId: repoId,
                  userId: this.userId
                }
              },
              upsert: true
            }
          }));
  
          if (bulkOps.length > 0) {
            await IssueComment.bulkWrite(bulkOps);
          }
  
          page++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error fetching comments for issue #${issueNumber}:`, error.message);
          if (error.response) {
            console.error(`Status: ${error.response.status}, Data:`, error.response.data);
          }
          hasMoreComments = false;
        }
      }
    } catch (error) {
      console.error(`Error syncing comments for issue #${issueNumber}:`, error);
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
                  avatarUrl: user.avatar_url,
                  url: user.html_url,
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
        { owner: 'facebook', repo: 'react' },
        { owner: 'vercel', repo: 'next.js' },
        { owner: 'microsoft', repo: 'vscode' }
      ];

      for (const { owner, repo } of openSourceRepos) {
        try {
          console.log(`Fetching ${owner}/${repo}`);
          const headers = {
            Authorization: `token ${this.accessToken || process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json'
          };

          const repoResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, { headers });
          const repoData = repoResponse.data;
          
          let existingRepo = await Repository.findOne({ 
            githubId: repoData.id,
            userId: this.userId 
          });
          
          if (!existingRepo) {
            let openSourceOrg = await Organization.findOne({ 
              name: 'OpenSource', 
              userId: this.userId 
            });
            
            if (!openSourceOrg) {
              openSourceOrg = await Organization.create({
                name: 'OpenSource',
                githubId: 0,
                url: 'https://github.com',
                description: 'Collection of open source repositories',
                avatarUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
                userId: this.userId
              });
            }
            
            existingRepo = await Repository.create({
              name: repoData.name,
              githubId: repoData.id,
              fullName: repoData.full_name,
              description: repoData.description,
              url: repoData.html_url,
              userId: this.userId,
              organizationId: openSourceOrg._id,
              isPrivate: repoData.private
            });
            
            console.log(`Created repository: ${repoData.full_name}`);
          } else {
            console.log(`Repository already exists: ${repoData.full_name}`);
          }

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
              const existingPRCount = await PullRequest.countDocuments({
                userId: this.userId
              });

              if (existingPRCount >= 1000) {
                console.log(`Skipping sync: Already ${existingPRCount} PRs exist for`);
                hasMorePRs = false;
                break;
              }

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
                  url: pull.html_url,
                  createdAt: pull.created_at,
                  updatedAt: pull.updated_at,
                  closedAt: pull.closed_at,
                  mergedAt: pull.merged_at,
                  authorLogin: pull.user.login,
                  repositoryId: existingRepo._id,
                  userId: this.userId
                });
              }
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

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

              const existingIssueCount = await Issue.countDocuments({
                userId: this.userId
              });

              if (existingIssueCount >= 600) {
                console.log(`Skipping sync: Already ${existingIssueCount} issues exist for`);
                hasMoreIssues = false;
                break;
              }
              
              const existingIssue = await Issue.findOne({ 
                githubId: issue.id,
                userId: this.userId 
              });
              
              if (!existingIssue) {
                await Issue.create({
                  githubId: issue.id,
                  number: issue.number,
                  title: issue.title,
                  body: issue.body,
                  state: issue.state,
                  url: issue.html_url,
                  createdAt: issue.created_at,
                  updatedAt: issue.updated_at,
                  closedAt: issue.closed_at,
                  authorLogin: issue.user.login,
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