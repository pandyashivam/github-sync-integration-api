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
      this.lastSyncTime = this.user.LastSynced ? new Date(this.user.LastSynced) : null;
      
      if (this.lastSyncTime) {
        console.log(`Last sync time: ${this.lastSyncTime.toISOString()}`);
      } else {
        console.log('No previous sync found, will perform full sync');
      }
      
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

      const syncType = this.lastSyncTime ? 'partial' : 'full';
      console.log(`Starting GitHub ${syncType} sync for user ${this.userId}`);
      
      this.user.LastSynced = new Date();
      this.user.isSyncInProgress = true;
      this.user.LastSyncedType = syncType;
      await this.user.save();

      try {
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
      } catch (error) {
        this.user.isSyncInProgress = false;
        this.user.LastSynced = new Date();
        await this.user.save();
        console.error('Error during GitHub sync:', error);
        return false;
      }
     
      
      
      
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
                url: orgData.url,
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
       
        if (org.name === 'OpenSource') {
          console.log('Skipping OpenSource organization - this is a custom organization for open source repos');
          continue;
        }
        
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
            const params = {
              per_page: this.PER_PAGE,
              page: page
            };
         
            if (this.lastSyncTime) {
              params.since = this.lastSyncTime.toISOString();
            }
            
            const commitsResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/repos/${repo.fullName}/commits`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              },
              params: params
            });

            const commits = commitsResponse.data;
            console.log(`Retrieved ${commits.length} commits from repo ${repo.name}, page ${page}`);
            if(commits.length === 0) {
              hasMoreCommits = false;
            }

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
                    avatar_url: commit.author.avatar_url,
                    url: commit.author.url
                  } : null,
                  committer: commit.committer ? {
                    login: commit.committer.login,
                    id: commit.committer.id,
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
            const params = {
              state: 'all',
              per_page: this.PER_PAGE,
              page: page,
              sort: 'updated',
              direction: 'desc'
            };
            
            const pullsResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/repos/${repo.fullName}/pulls`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              },
              params: params
            });

            let pulls = pullsResponse.data;
            
            // Filter pulls by lastSyncTime if it exists
            if (this.lastSyncTime) {
              pulls = pulls.filter(pull => {
                const updatedAt = new Date(pull.updated_at);
                return updatedAt > this.lastSyncTime;
              });
              
              // If we've reached pulls older than our lastSyncTime, we can stop paginating
              if (pulls.length < pullsResponse.data.length) {
                hasMorePulls = false;
              }
            }
            
            console.log(`Retrieved ${pulls.length} PRs from repo ${repo.name}, page ${page}`);
            
            if (pulls.length < this.PER_PAGE) {
              hasMorePulls = false;
            }
            
            for (const pull of pulls) {
              // Fetch commits for this PR
              const prCommits = await this.fetchPullRequestCommits(repo.fullName, pull.number, repo._id);
              
              // Store PR with commits
              const savedPR = await PullRequest.findOneAndUpdate(
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
                    avatar_url: pull.user.avatar_url
                  } : null,
                  created_at: pull.created_at,
                  closed_at: pull.closed_at,
                  assignee: pull.assignee ? {
                    login: pull.assignee.login,
                    id: pull.assignee.id,
                    avatar_url: pull.assignee.avatar_url
                  } : null,
                  commits: prCommits.map(commit => ({ sha: commit.sha })),
                  labels: pull.labels?.map(label => ({
                    id: label.id,
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

  async fetchPullRequestCommits(repoFullName, prNumber, repoId = null) {
    try {
      const commitsResponse = await axios({
        method: 'GET',
        url: `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/commits`,
        headers: {
          Authorization: `token ${this.accessToken || process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json'
        },
        params: {
          per_page: 100 // GitHub's max per page
        }
      });

      const commits = commitsResponse.data;
      console.log(`Retrieved ${commits.length} commits for PR #${prNumber} in repo ${repoFullName}`);

      // Process each commit
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
              avatar_url: commit.author.avatar_url,
              url: commit.author.url
            } : null,
            committer: commit.committer ? {
              login: commit.committer.login,
              id: commit.committer.id,
              avatar_url: commit.committer.avatar_url,
              url: commit.committer.url
            } : null,
            url: commit.html_url,
            repositoryId: repoId,
            userId: this.userId
          },
          { upsert: true, new: true }
        );
      }

      return commits;
    } catch (error) {
      console.error(`Error fetching commits for PR #${prNumber}:`, error.message);
      if (error.response) {
        console.error(`Status: ${error.response.status}, Data:`, error.response.data);
      }
      return [];
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
            const params = {
              state: 'all',
              per_page: this.PER_PAGE,
              page: page,
              sort: 'updated',  
              direction: 'desc'
            };
            
            const issuesResponse = await axios({
              method: 'GET',
              url: `https://api.github.com/repos/${repo.fullName}/issues`,
              headers: {
                Authorization: `token ${this.accessToken}`,
                Accept: 'application/vnd.github.v3+json' 
              },
              params: params
            });

            let allIssues = issuesResponse.data;
            
            if (this.lastSyncTime) {
              allIssues = allIssues.filter(issue => {
                const updatedAt = new Date(issue.updated_at);
                return updatedAt > this.lastSyncTime;
              });
             
              if (allIssues.length < issuesResponse.data.length) {
                hasMoreIssues = false;
              }
            }
            
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
                  number: issue.number,
                  title: issue.title,
                  user: issue.user ? {
                    login: issue.user.login,
                    id: issue.user.id,
                    avatar_url: issue.user.avatar_url
                  } : null,
                  labels: issue.labels?.map(label => ({
                    id: label.id,
                    name: label.name,
                    color: label.color,
                    default: label.default,
                    description: label.description
                  })),
                  state: issue.state,
                  created_at: issue.created_at,
                  author_association: issue.author_association,
                  draft: issue.draft,
                  pull_request: issue.pull_request ? {
                    url: issue.pull_request.url,
                    html_url: issue.pull_request.html_url,
                    diff_url: issue.pull_request.diff_url,
                    patch_url: issue.pull_request.patch_url
                  } : null,
                  body: issue.body,
                  closed_at: issue.closed_at,
                  closed_by: issue.closed_by ? {
                    id: issue.closed_by.id,
                    login: issue.closed_by.login,
                    avatar_url: issue.closed_by.avatar_url
                  } : null,
                  repositoryId: repo._id,
                  userId: this.userId
                },
                { upsert: true, new: true }
              );
              
              await this.syncIssueChangelogs(repo.fullName, issue.number, savedIssue._id, repo._id, issue.id);
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

  async syncIssueChangelogs(repoFullName, issueNumber, issueId, repoId, githubIssueId) {
    try {
      console.log(`Fetching changelogs for issue #${issueNumber} in repo ${repoFullName}`);
      const issueObjectId = new mongoose.Types.ObjectId(issueId);
  
      // Fetch from the timeline URL
      try {
        const timelineResponse = await axios({
          method: 'GET',
          url: `https://api.github.com/repos/${repoFullName}/issues/${issueNumber}/timeline`,
          headers: {
            Authorization: `token ${this.accessToken || process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json'
          },
          params: {
            per_page: this.PER_PAGE,
            page: 1
          }
        });

        const timelineEvents = timelineResponse.data;
        console.log(`Retrieved ${timelineEvents.length} timeline events for issue #${issueNumber}`);

        // Process timeline events
        for (const event of timelineEvents) {
          // Ensure we have a valid ID for the event
          let eventId = event.id;
          if (!eventId) {
            // Some timeline events might not have IDs, generate a unique ID
            eventId = new mongoose.Types.ObjectId().toString();
            console.log(`Generated new ID for event without ID: ${eventId}`);
          } else {
            // Ensure the ID is stored as a string to avoid type conversion issues
            eventId = String(eventId);
          }

          // Create a base event object with common fields
          const eventData = {
            githubId: eventId,
            url: event.url,
            event: event.event,
            created_at: event.created_at,
            githubIssueId: githubIssueId,
            issueId: issueObjectId,
            repositoryId: repoId,
            userId: this.userId
          };

          // Add actor if available
          if (event.actor) {
            eventData.actor = {
              login: event.actor.login,
              id: event.actor.id,
              avatar_url: event.actor.avatar_url,
              url: event.actor.url
            };
          }

          // Standardize the event details into a common format
          let eventDetails = {};
          let eventSummary = '';

          // Handle different event types
          switch (event.event) {
            case 'committed':
              eventSummary = `Commit: ${event.message ? event.message.split('\n')[0] : 'No message'}`;
              eventDetails = {
                sha: event.sha,
                message: event.message,
                author: event.author ? `${event.author.name} <${event.author.email}>` : 'Unknown',
                date: event.author ? event.author.date : event.created_at
              };
              break;
              
            case 'labeled':
              eventSummary = `Added label: ${event.label ? event.label.name : 'Unknown'}`;
              eventDetails = {
                label: event.label ? event.label.name : 'Unknown',
                color: event.label ? event.label.color : null
              };
              break;
              
            case 'unlabeled':
              eventSummary = `Removed label: ${event.label ? event.label.name : 'Unknown'}`;
              eventDetails = {
                label: event.label ? event.label.name : 'Unknown',
                color: event.label ? event.label.color : null
              };
              break;
              
            case 'assigned':
              eventSummary = `Assigned to: ${event.assignee ? event.assignee.login : 'Unknown'}`;
              eventDetails = {
                assignee: event.assignee ? event.assignee.login : 'Unknown',
                assigneeId: event.assignee ? event.assignee.id : null
              };
              break;
              
            case 'unassigned':
              eventSummary = `Unassigned: ${event.assignee ? event.assignee.login : 'Unknown'}`;
              eventDetails = {
                assignee: event.assignee ? event.assignee.login : 'Unknown',
                assigneeId: event.assignee ? event.assignee.id : null
              };
              break;
              
            case 'milestoned':
              eventSummary = `Added to milestone: ${event.milestone ? event.milestone.title : 'Unknown'}`;
              eventDetails = {
                milestone: event.milestone ? event.milestone.title : 'Unknown',
                milestoneId: event.milestone ? event.milestone.id : null
              };
              break;
              
            case 'demilestoned':
              eventSummary = `Removed from milestone: ${event.milestone ? event.milestone.title : 'Unknown'}`;
              eventDetails = {
                milestone: event.milestone ? event.milestone.title : 'Unknown',
                milestoneId: event.milestone ? event.milestone.id : null
              };
              break;
              
            case 'renamed':
              eventSummary = `Renamed from "${event.rename ? event.rename.from : 'Unknown'}" to "${event.rename ? event.rename.to : 'Unknown'}"`;
              eventDetails = {
                from: event.rename ? event.rename.from : 'Unknown',
                to: event.rename ? event.rename.to : 'Unknown'
              };
              break;
              
            case 'referenced':
              eventSummary = `Referenced in commit: ${event.commit_id ? event.commit_id.substring(0, 7) : 'Unknown'}`;
              eventDetails = {
                commitId: event.commit_id,
                commitUrl: event.commit_url,
                repository: event.commit_repository ? event.commit_repository.full_name : repoFullName
              };
              break;
              
            case 'cross-referenced':
              let sourceType = 'Unknown';
              let sourceNumber = '';
              let sourceRepo = '';
              
              if (event.source && event.source.issue) {
                sourceType = 'Issue';
                sourceNumber = event.source.issue.number;
                sourceRepo = event.source.issue.repository ? event.source.issue.repository.full_name : '';
              } else if (event.source && event.source.pull_request) {
                sourceType = 'Pull Request';
                sourceNumber = event.source.pull_request.number;
                sourceRepo = event.source.pull_request.repository ? event.source.pull_request.repository.full_name : '';
              }
              
              eventSummary = `Cross-referenced in ${sourceType} #${sourceNumber} (${sourceRepo})`;
              eventDetails = {
                sourceType: sourceType,
                sourceNumber: sourceNumber,
                sourceRepo: sourceRepo
              };
              break;
              
            case 'reviewed':
            case 'review_requested':
            case 'review_request_removed':
              let reviewUser = 'Unknown';
              let reviewState = '';
              
              if (event.review) {
                reviewUser = event.review.user ? event.review.user.login : 'Unknown';
                reviewState = event.review.state || '';
              } else if (event.requested_reviewer) {
                reviewUser = event.requested_reviewer.login || 'Unknown';
              }
              
              eventSummary = `${event.event === 'reviewed' ? 'Reviewed by' : 
                             event.event === 'review_requested' ? 'Review requested from' : 
                             'Review request removed from'}: ${reviewUser}`;
              eventDetails = {
                user: reviewUser,
                state: reviewState
              };
              break;
              
            case 'commented':
              eventSummary = 'Added a comment';
              eventDetails = {
                body: event.body ? event.body.substring(0, 100) + (event.body.length > 100 ? '...' : '') : '',
                url: event.html_url || event.url
              };
              break;
              
            case 'locked':
              eventSummary = `Issue locked${event.lock_reason ? ` (${event.lock_reason})` : ''}`;
              eventDetails = {
                reason: event.lock_reason || 'Not specified'
              };
              break;
              
            case 'unlocked':
              eventSummary = 'Issue unlocked';
              eventDetails = {};
              break;
              
            case 'head_ref_deleted':
              eventSummary = `Branch deleted: ${event.head_ref_name || 'Unknown'}`;
              eventDetails = {
                branch: event.head_ref_name || 'Unknown'
              };
              break;
              
            case 'head_ref_restored':
              eventSummary = `Branch restored: ${event.head_ref_name || 'Unknown'}`;
              eventDetails = {
                branch: event.head_ref_name || 'Unknown'
              };
              break;
              
            case 'head_ref_force_pushed':
              eventSummary = `Branch force-pushed: ${event.head_ref_name || 'Unknown'}`;
              eventDetails = {
                branch: event.head_ref_name || 'Unknown',
                commitId: event.head_commit_id || null
              };
              break;
              
            case 'base_ref_changed':
              eventSummary = `Base branch changed to: ${event.base_ref_name || 'Unknown'}`;
              eventDetails = {
                branch: event.base_ref_name || 'Unknown'
              };
              break;
              
            case 'closed':
              eventSummary = 'Issue closed';
              eventDetails = {};
              break;
              
            case 'reopened':
              eventSummary = 'Issue reopened';
              eventDetails = {};
              break;
              
            case 'added_to_project':
            case 'moved_columns_in_project':
            case 'removed_from_project':
              let projectName = 'Unknown';
              let columnName = '';
              
              if (event.project_card && event.project_card.project) {
                projectName = event.project_card.project.name || 'Unknown';
                if (event.project_card.column) {
                  columnName = event.project_card.column.name || '';
                }
              }
              
              eventSummary = `${event.event === 'added_to_project' ? 'Added to' : 
                             event.event === 'moved_columns_in_project' ? 'Moved in' : 
                             'Removed from'} project: ${projectName}${columnName ? ` (${columnName})` : ''}`;
              eventDetails = {
                project: projectName,
                column: columnName
              };
              break;
              
            default:
              eventSummary = `${event.event}`;
              eventDetails = {};
              break;
          }

          // Add standardized fields to the event data
          eventData.summary = eventSummary;
          eventData.details = eventDetails;

          try {
            // Save the event with standardized fields
            await IssueHistory.findOneAndUpdate(
              { githubId: eventData.githubId, userId: this.userId },
              eventData,
              { upsert: true, new: true }
            );
          } catch (saveError) {
            console.error(`Error saving event with ID ${eventData.githubId}:`, saveError.message);
            console.error('Event data:', JSON.stringify(eventData, null, 2));
          }
        }
      } catch (error) {
        console.error(`Error fetching timeline for issue #${issueNumber}:`, error.message);
        if (error.response) {
          console.error(`Status: ${error.response.status}, Data:`, error.response.data);
        }
      }
    } catch (error) {
      console.error(`Error syncing events for issue #${issueNumber}:`, error);
    }
  }

  async syncOrganizationUsers() {
    try {
      console.log(`Starting organization users sync`);
      
      const shouldDoFullSync = !this.lastSyncTime || 
        ((new Date() - this.lastSyncTime) > 7 * 24 * 60 * 60 * 1000);
      
      if (!shouldDoFullSync) {
        console.log('Skipping organization users sync - less than 7 days since last sync');
        return;
      }
      
      const organizations = await Organization.find({ userId: this.userId });
      const USER_LIMIT = 20;
      
      for (const org of organizations) {
        // Skip the OpenSource organization as it's handled separately
        if (org.name === 'OpenSource') {
          console.log('Skipping OpenSource organization - this is handled separately');
          continue;
        }
        
        // Check how many users we already have for this organization
        const existingUserCount = await OrganizationUser.countDocuments({
          organizationId: org._id,
          userId: this.userId
        });
        
        // If we already have 20 or more users, skip adding more
        if (existingUserCount >= USER_LIMIT) {
          console.log(`Organization ${org.name} already has ${existingUserCount} users, which meets or exceeds the limit of ${USER_LIMIT}. Skipping user fetch.`);
          continue;
        }
        
        // Calculate how many more users we can add
        const remainingUserSlots = USER_LIMIT - existingUserCount;
        console.log(`Can add up to ${remainingUserSlots} more users to ${org.name} to reach the limit of ${USER_LIMIT}`);
        
        let page = 1;
        let hasMoreUsers = true;
        let addedUsers = 0;
        
        while (hasMoreUsers && addedUsers < remainingUserSlots) {
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
            
            // Process only as many users as we need to reach the limit
            for (let i = 0; i < users.length && addedUsers < remainingUserSlots; i++) {
              const user = users[i];
              
              // Check if this user already exists
              const existingUser = await OrganizationUser.findOne({
                githubId: user.id, 
                organizationId: org._id,
                userId: this.userId
              });
              
              if (!existingUser) {
                await OrganizationUser.create({
                  githubId: user.id,
                  login: user.login,
                  avatar_url: user.avatar_url,
                  url: user.url,
                  organizationId: org._id,
                  userId: this.userId
                });
                
                addedUsers++;
                console.log(`Added user: ${user.login} (${addedUsers}/${remainingUserSlots})`);
                
                // If we've reached the user limit, break out
                if (addedUsers >= remainingUserSlots) {
                  console.log(`Reached user limit of ${USER_LIMIT} for organization ${org.name}. Stopping user fetch.`);
                  break;
                }
              } else {
                console.log(`User ${user.login} already exists in organization ${org.name}, skipping.`);
              }
            }
            
            // If we've reached the user limit or processed all users, break out
            if (addedUsers >= remainingUserSlots) {
              break;
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
        
        console.log(`Completed fetching users for organization ${org.name}. Added ${addedUsers} new users.`);
      }
      
      console.log(`Organization users sync completed`);
    } catch (error) {
      console.error('Error in syncOrganizationUsers:', error);
    }
  }

  async fetchOpenSourceRepoData() {
    try {
      console.log(`Starting open source repositories sync`);
      
      const shouldDoFullSync = !this.lastSyncTime || 
        ((new Date() - this.lastSyncTime) > 24 * 60 * 60 * 1000);
      
      if (!shouldDoFullSync) {
        console.log('Fetching only updated open source data since last sync');
      } else {
        console.log('Performing full open source data sync');
      }
      
      const openSourceRepos = [
        { owner: 'nodejs', repo: 'node' },      
        { owner: 'nestjs', repo: 'nest' }, 
        { owner: 'microsoft', repo: 'vscode' },
        { owner: 'facebook', repo: 'react' },          
        { owner: 'vercel', repo: 'next.js' },          
        { owner: 'angular', repo: 'angular' },         
        { owner: 'tensorflow', repo: 'tensorflow' },   
        { owner: 'microsoft', repo: 'TypeScript' },  
        { owner: 'webpack', repo: 'webpack' },         
        { owner: 'vuejs', repo: 'vue' },              
        { owner: 'facebook', repo: 'jest' },           
        { owner: 'eslint', repo: 'eslint' },           
        { owner: 'storybookjs', repo: 'storybook' },   
        { owner: 'reduxjs', repo: 'redux' },           
        { owner: 'grafana', repo: 'grafana' },       
        { owner: 'prisma', repo: 'prisma' },           
        { owner: 'supabase', repo: 'supabase' },      
        { owner: 'hasura', repo: 'graphql-engine' },   
        { owner: 'axios', repo: 'axios' },             
        { owner: 'vitejs', repo: 'vite' },  
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

      // Check if all repositories already exist
      const existingRepos = await Repository.find({
        userId: this.userId,
        organizationId: openSourceOrg._id
      });

      const existingRepoNames = existingRepos.map(repo => repo.name);
      const isAnyExistingRepo = existingRepoNames.some(repo => openSourceRepos.some(({ owner, repo }) => repo === repo));
      

      if (isAnyExistingRepo ) {
        console.log('open source repositories already exist and no full sync required, skipping fetch');
        return true;
      }

      // Track total counts across all repos
      let totalPRCount = 0;
      let totalIssueCount = 0;
      const PR_LIMIT = 2001;
      const ISSUE_LIMIT = 600;

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
          
          while (hasMorePRs && totalPRCount < PR_LIMIT) {
            const pullsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
              headers,
              params: { 
                state: 'all', 
                per_page: this.PER_PAGE, 
                page: page,
                sort: 'updated',
                direction: 'desc'
              }
            });
            
            let pulls = pullsResponse.data;
            
            if (this.lastSyncTime) {
              pulls = pulls.filter(pull => {
                const updatedAt = new Date(pull.updated_at);
                return updatedAt > this.lastSyncTime;
              });
              
              if (pulls.length < pullsResponse.data.length) {
                hasMorePRs = false;
              }
            }
            console.log(`PRs fetched (page ${page}): ${pulls.length}`);
            
            if (pulls.length < this.PER_PAGE) {
              hasMorePRs = false;
            }
            
            // Calculate how many PRs we can process from this batch
            const remainingPRs = PR_LIMIT - totalPRCount;
            const prsToProcess = Math.min(pulls.length, remainingPRs);
            
            for (let i = 0; i < prsToProcess; i++) {
              const pull = pulls[i];
              totalPRCount++;
              
              const existingPR = await PullRequest.findOne({ 
                githubId: pull.id,
                userId: this.userId 
              });
              
              if (!existingPR) {
                // Fetch commits for this PR
                const prCommits = await this.fetchPullRequestCommits(`${owner}/${repo}`, pull.number, existingRepo._id);
                
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
                    avatar_url: pull.user.avatar_url
                  } : null,
                  created_at: pull.created_at,
                  closed_at: pull.closed_at,
                  assignee: pull.assignee ? {
                    login: pull.assignee.login,
                    id: pull.assignee.id,
                    avatar_url: pull.assignee.avatar_url
                  } : null,
                  commits: prCommits.map(commit => ({ sha: commit.sha })),
                  labels: pull.labels?.map(label => ({
                    id: label.id,
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
            
            // If we've reached the PR limit, break out
            if (totalPRCount >= PR_LIMIT) {
              console.log(`Reached PR limit of ${PR_LIMIT}. Stopping PR fetch.`);
              break;
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Fetch issues
          page = 1;
          let hasMoreIssues = true;
          
          while (hasMoreIssues && totalIssueCount < ISSUE_LIMIT) {
            const issuesResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues`, {
              headers,
              params: { 
                state: 'all', 
                per_page: this.PER_PAGE, 
                page: page,
                sort: 'updated',
                direction: 'desc'
              }
            });
            
            let issues = issuesResponse.data;
            
            if (this.lastSyncTime) {
              issues = issues.filter(issue => {
                const updatedAt = new Date(issue.updated_at);
                return updatedAt > this.lastSyncTime;
              });
              
              if (issues.length < issuesResponse.data.length) {
                hasMoreIssues = false;
              }
            }
            
            // Filter out pull requests (GitHub returns PRs in the issues endpoint)
            issues = issues.filter(issue => !issue.pull_request);
            console.log(`Issues fetched (page ${page}): ${issues.length}`);
            
            if (issues.length < this.PER_PAGE) {
              hasMoreIssues = false;
            }
            
            // Calculate how many issues we can process from this batch
            const remainingIssues = ISSUE_LIMIT - totalIssueCount;
            const issuesToProcess = Math.min(issues.length, remainingIssues);
            
            for (let i = 0; i < issuesToProcess; i++) {
              const issue = issues[i];
              totalIssueCount++;
              
              const existingIssue = await Issue.findOne({ 
                githubId: issue.id,
                userId: this.userId 
              });
              
              if (!existingIssue) {
                const savedIssue = await Issue.create({
                  githubId: issue.id,
                  url: issue.url,
                  repository_url: issue.repository_url,
                  number: issue.number,
                  title: issue.title,
                  user: issue.user ? {
                    login: issue.user.login,
                    id: issue.user.id,
                    avatar_url: issue.user.avatar_url
                  } : null,
                  labels: issue.labels?.map(label => ({
                    id: label.id,
                    name: label.name,
                    color: label.color,
                    default: label.default,
                    description: label.description
                  })),
                  state: issue.state,
                  created_at: issue.created_at,
                  author_association: issue.author_association,
                  draft: issue.draft,
                  pull_request: issue.pull_request ? {
                    url: issue.pull_request.url,
                    html_url: issue.pull_request.html_url,
                    diff_url: issue.pull_request.diff_url,
                    patch_url: issue.pull_request.patch_url
                  } : null,
                  body: issue.body,
                  closed_at: issue.closed_at,
                  closed_by: issue.closed_by ? {
                    id: issue.closed_by.id,
                    login: issue.closed_by.login,
                    avatar_url: issue.closed_by.avatar_url
                  } : null,
                  repositoryId: existingRepo._id,
                  userId: this.userId
                });
                
                await this.syncIssueChangelogs(
                  `${owner}/${repo}`, 
                  issue.number, 
                  savedIssue._id, 
                  existingRepo._id,
                  issue.id
                );
              }
            }
            
            // If we've reached the issue limit, break out
            if (totalIssueCount >= ISSUE_LIMIT) {
              console.log(`Reached issue limit of ${ISSUE_LIMIT}. Stopping issue fetch.`);
              break;
            }
            
            page++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          console.log(`Successfully processed ${owner}/${repo}`);

        } catch (err) {
          console.error(`Failed to fetch ${owner}/${repo}:`, err.response?.data || err.message);
        }
      }
      
      console.log(`Open source repositories sync completed. Fetched ${totalPRCount} PRs and ${totalIssueCount} issues.`);
      return true;
    } catch (error) {
      console.error('Error in fetchOpenSourceRepoData:', error);
      return false;
    }
  }

  async fetchOpenSourceRepoMembers(owner, repo, organizationId) {
    try {
      console.log(`Fetching contributors for ${owner}/${repo}`);
      
      const shouldDoFullSync = !this.lastSyncTime || 
        ((new Date() - this.lastSyncTime) > 7 * 24 * 60 * 60 * 1000);
      
      if (!shouldDoFullSync) {
        console.log(`Skipping contributors sync for ${owner}/${repo} - less than 7 days since last sync`);
        return;
      }
      
      // Check how many users we already have for this organization
      const USER_LIMIT = 20;
      const existingUserCount = await OrganizationUser.countDocuments({
        organizationId: organizationId,
        userId: this.userId
      });
      
      // If we already have 20 or more users, skip adding more
      if (existingUserCount >= USER_LIMIT) {
        console.log(`Organization already has ${existingUserCount} users, which meets or exceeds the limit of ${USER_LIMIT}. Skipping contributor fetch.`);
        return;
      }
      
      // Calculate how many more users we can add
      const remainingUserSlots = USER_LIMIT - existingUserCount;
      console.log(`Can add up to ${remainingUserSlots} more contributors to reach the limit of ${USER_LIMIT}`);
      
      let page = 1;
      let hasMoreContributors = true;
      let addedUsers = 0;
      
      while (hasMoreContributors && addedUsers < remainingUserSlots) {
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
          
          // Process only as many contributors as we need to reach the limit
          for (let i = 0; i < contributors.length && addedUsers < remainingUserSlots; i++) {
            const contributor = contributors[i];
            // For each contributor, fetch detailed user info
            try {
              const userResponse = await axios.get(`https://api.github.com/users/${contributor.login}`, { headers });
              const userData = userResponse.data;
              
              // Check if this user already exists
              const existingUser = await OrganizationUser.findOne({ 
                githubId: userData.id, 
                organizationId: organizationId,
                userId: this.userId 
              });
              
              if (!existingUser) {
                await OrganizationUser.create({
                  githubId: userData.id,
                  login: userData.login,
                  avatar_url: userData.avatar_url,
                  url: userData.url,
                  organizationId: organizationId,
                  userId: this.userId
                });
                
                addedUsers++;
                console.log(`Added contributor: ${userData.login} (${addedUsers}/${remainingUserSlots})`);
                
                // If we've reached the user limit, break out
                if (addedUsers >= remainingUserSlots) {
                  console.log(`Reached user limit of ${USER_LIMIT}. Stopping contributor fetch.`);
                  break;
                }
              } else {
                console.log(`Contributor ${userData.login} already exists, skipping.`);
              }
              
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
          
          // If we've reached the user limit or processed all contributors, break out
          if (addedUsers >= remainingUserSlots) {
            break;
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
      
      console.log(`Completed fetching contributors for ${owner}/${repo}. Added ${addedUsers} new contributors.`);
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