const mongoose = require('mongoose');
const User = require('../models/User');
const { ObjectId } = require('mongoose').Types;
const excludedFields = {
  merge_commit_sha: 0,
  merged_at: 0,
  updatedAt: 0,
  'assignee.events_url': 0,
  'assignee.followers_url': 0,
  'assignee.following_url': 0,
  'assignee.gists_url': 0,
  'assignee.gravatar_id': 0,
  'assignee.html_url': 0,
  'assignee.node_id': 0,
  'assignee.organizations_url': 0,
  'assignee.received_events_url': 0,
  'assignee.site_admin': 0,
  'assignee.starred_url': 0,
  'assignee.subscriptions_url': 0,
  'assignee.type': 0,
  'assignee.url': 0,
  'assignee.user_view_type': 0,
  'assignee.repos_url': 0,
  requested_reviewers: 0,
  requested_teams: 0,
  createdAt: 0,
  assignees : 0,
  updated_at: 0,
  'user.node_id': 0,
  events_url: 0,
  hooks_url:0,
  issues_url:0,
  members_url:0,
  public_members_url:0,
  repos_url:0,
  node_id:0,
  'author.url':0,
  'author.node_id':0,
  'committer.node_id':0,
  'labels.node_id':0,
  'labels.url':0,
  labels_url:0,
  performed_via_github_app:0,
  reactions:0,
  state_reason:0,
  timeline_url:0,
  'closed_by.node_id':0,
  'closed_by.events_url':0,
  'closed_by.followers_url':0,
  'closed_by.following_url':0,
  'closed_by.gists_url':0,
  'closed_by.gravatar_id':0,
  'closed_by.html_url':0,
  'closed_by.organizations_url':0,
  'closed_by.received_events_url':0,
  'closed_by.repos_url':0,
  'closed_by.site_admin':0,
  'closed_by.starred_url':0,
  'closed_by.subscriptions_url':0,
  'closed_by.type':0,
  'closed_by.url':0,
  'closed_by.user_view_type':0,
  type:0,
}

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-githubAccessToken');
    
    return res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

exports.getAllAvailableModels = async (req, res) => {
  try {
    const modelNames = Object.keys(mongoose.models).filter(model => 
      !model.startsWith('_')
    );
    
    const modelDetails = modelNames.map(modelName => {
      return {
        name: modelName
      };
    });
    
    return res.status(200).json({
      success: true,
      count: modelNames.length,
      data: modelDetails
    });
  } catch (error) {
    console.error('Error fetching model names:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

exports.getModelData = async (req, res) => {
  try {
    const { modelName } = req.params;
    const { userId } = req.query;
    
    if (!modelName) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    if (!mongoose.models[modelName]) {
      return res.status(404).json({
        success: false,
        error: `Model ${modelName} not found`
      });
    }
    
    const Model = mongoose.models[modelName];
    
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const skip = (page - 1) * limit;
    
    const search = req.query.search || '';
    
    let query = {};
    if(modelName === 'User'){
      query = { _id: new ObjectId(userId) };
    }else{
      query = { userId: new ObjectId(userId) };
    }
    
    const advancedFilters = processAdvancedFilters(req.query, Model);
    
    if (Object.keys(advancedFilters).length > 0) {
      query = { 
        $and: [
          query,
          advancedFilters
        ]
      };
    }
    
    if (search) {
      const schemaFields = Object.keys(Model.schema.paths).filter(
        field => !field.startsWith('_')
      );
      
      if (schemaFields.length > 0) {
        const searchConditions = [];
        
        schemaFields.forEach(field => {
          const fieldType = Model.schema.paths[field].instance;
          
          if (fieldType === 'String') {
            searchConditions.push({
              [field]: { $regex: search, $options: 'i' }
            });
          } 
          else if (fieldType === 'Number' && !isNaN(Number(search))) {
            searchConditions.push({
              [field]: Number(search)
            });
          }
          else if (fieldType === 'Boolean' && 
                  (search.toLowerCase() === 'true' || search.toLowerCase() === 'false')) {
            searchConditions.push({
              [field]: search.toLowerCase() === 'true'
            });
          }
          else if (fieldType === 'Date' && !isNaN(Date.parse(search))) {
            const searchDate = new Date(search);
            const nextDay = new Date(searchDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            searchConditions.push({
              [field]: { 
                $gte: searchDate,
                $lt: nextDay
              }
            });
          }
          else if (fieldType === 'ObjectID' && ObjectId.isValid(search)) {
            searchConditions.push({
              [field]: new ObjectId(search)
            });
          }
        });
        
        if (searchConditions.length > 0) {
          if (query.$and) {
            query.$and.push({ $or: searchConditions });
          } else {
            query = { 
              $and: [
                query,
                { $or: searchConditions }
              ]
            };
          }
        }
      }
    }
    
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortOrder };
    
    delete query.sortOrder;
    const total = await Model.countDocuments(query);
    const data = await Model.find(query)
    .select(excludedFields)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
  

    //  const fields = data.length > 0 ? Object.keys(data[0])
    //   .filter(field => !field.startsWith('_'))
    //   .map(field => {
    //     const fieldType = data[0][field];
    //     return {
    //       field,
    //       type: typeof fieldType
    //     };
    //   }) : typeof fieldType;
    
    // const fields = Object.keys(Model.schema.paths)
    //   .filter(field => !field.startsWith('_'))
    //   .map(field => {
    //     const fieldType = Model.schema.paths[field].instance;
    //     return {
    //       field,
    //       type: fieldType.toLowerCase()
    //     };
    //   });

    const fields = extractDistinctFields(data).filter(x => !x.field.startsWith('_'));
    
    return res.status(200).json({
      success: true,
      count: data.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalRecords: total,
      fields,
      data
    });
    
  } catch (error) {
    console.error('Error fetching model data:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
}; 

function extractDistinctFields(documents) {
  const fieldMap = new Map();

  const excludePatterns = [
    'buffer', 'readUInt', 'readInt', 'readDouble', 'write', 'inspect', 'toJSON'
  ];

  function shouldExclude(fieldPath) {
    return excludePatterns.some(pattern => fieldPath.includes(pattern));
  }

  function extract(obj, parentKey = '') {
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

      const fullKey = parentKey ? `${parentKey}.${key}` : key;
      const value = obj[key];

      if (shouldExclude(fullKey)) continue;

      if (!fieldMap.has(fullKey)) {
        let type = Array.isArray(value) ? 'array' : typeof value;
        if (Buffer.isBuffer(value)) type = 'buffer';
        if (value instanceof Date) type = 'date';
        fieldMap.set(fullKey, type);
      }

      if (value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) {
        extract(value, fullKey);
      }
    }
  }

  for (const doc of documents) {
    extract(doc);
  }

  return Array.from(fieldMap.entries()).map(([field, type]) => ({
    field,
    type
  }));
}

function processAdvancedFilters(queryParams, Model) {
  const advancedFilters = {};
  const excludedParams = ['page', 'limit', 'search', 'userId', 'sort', 'sortOrder'];
  
  Object.keys(queryParams).forEach(key => {
    if (excludedParams.includes(key)) {
      return;
    }
    
    if (key.includes('_')) {
      const [fieldName, operation] = key.split('_');
      
      if (!Model.schema.paths[fieldName]) {
        return;
      }
      
      const fieldType = Model.schema.paths[fieldName].instance;
      const value = queryParams[key];
      
      switch (operation) {
        case 'contains':
          advancedFilters[fieldName] = { $regex: value, $options: 'i' };
          break;
        case 'notContains':
          advancedFilters[fieldName] = { $not: { $regex: value, $options: 'i' } };
          break;
        case 'startsWith':
          advancedFilters[fieldName] = { $regex: `^${value}`, $options: 'i' };
          break;
        case 'endsWith':
          advancedFilters[fieldName] = { $regex: `${value}$`, $options: 'i' };
          break;
        case 'empty':
          advancedFilters[fieldName] = { $in: ['', null] };
          break;
        case 'ne':
          if (fieldType === 'Number') {
            advancedFilters[fieldName] = { $ne: Number(value) };
          } else {
            advancedFilters[fieldName] = { $ne: value };
          }
          break;
        case 'gt':
          advancedFilters[fieldName] = { $gt: Number(value) };
          break;
        case 'gte':
          advancedFilters[fieldName] = { $gte: Number(value) };
          break;
        case 'lt':
          advancedFilters[fieldName] = { $lt: Number(value) };
          break;
        case 'lte':
          advancedFilters[fieldName] = { $lte: Number(value) };
          break;
      }
    } else {
      if (Model.schema.paths[key]) {
        const fieldType = Model.schema.paths[key].instance;
        const value = queryParams[key];
        
        if (fieldType === 'Number') {
          advancedFilters[key] = Number(value);
        } else if (fieldType === 'Boolean') {
          advancedFilters[key] = value === 'true';
        } else if (fieldType === 'Date') {
          let date = new Date(value);
          date.setHours(0, 0, 0, 0);
          let nextDay = new Date(date);
          nextDay.setDate(nextDay.getDate() + 2);
          advancedFilters[key] = { $gte: date, $lt: nextDay };
        } else {
          advancedFilters[key] = value;
        }
      }
    }
  });
  
  return advancedFilters;
}

exports.getUserDetails = async (req, res) => {
  try {
    const { assigneeId, modelName } = req.params;
    const { page = 1, limit = 25, search = '', sort = 'created_at', sortOrder = 'desc' } = req.query;
    
    if (!assigneeId) {
      return res.status(400).json({
        success: false,
        error: 'Assignee ID is required'
      });
    }
    
    if (!modelName || !['Issue', 'PullRequest'].includes(modelName)) {
      return res.status(400).json({
        success: false,
        error: 'Valid model name (Issue or PullRequest) is required'
      });
    }
    
    const Model = mongoose.models[modelName];
    if (!Model) {
      return res.status(404).json({
        success: false,
        error: `Model ${modelName} not found`
      });
    }
    
    let query = {};
    let userDetails = null;
    
    if (modelName === 'Issue') {
      query = { 'closed_by.id': parseInt(assigneeId) };
      const issue = await Model.findOne(query).lean();
      if (issue && issue.closed_by) {
        userDetails = issue.closed_by;
      }
    } else if (modelName === 'PullRequest') {
      query = { 'assignee.id': parseInt(assigneeId) };
      const pr = await Model.findOne(query).lean();
      if (pr && pr.assignee) {
        userDetails = pr.assignee;
      }
    }
    
    if (!userDetails) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Process advanced filters from query params
    const advancedFilters = {};
    const excludedParams = ['page', 'limit', 'search', 'sort', 'sortOrder'];
    
    Object.keys(req.query).forEach(key => {
      if (excludedParams.includes(key)) {
        return;
      }
      
      if (key.includes('_')) {
        const [fieldName, operation] = key.split('_');
        const value = req.query[key];
        
        switch (operation) {
          case 'contains':
            advancedFilters[fieldName] = { $regex: value, $options: 'i' };
            break;
          case 'notContains':
            advancedFilters[fieldName] = { $not: { $regex: value, $options: 'i' } };
            break;
          case 'startsWith':
            advancedFilters[fieldName] = { $regex: `^${value}`, $options: 'i' };
            break;
          case 'endsWith':
            advancedFilters[fieldName] = { $regex: `${value}$`, $options: 'i' };
            break;
          case 'empty':
            advancedFilters[fieldName] = { $in: ['', null] };
            break;
          case 'ne':
            if (!isNaN(Number(value))) {
              advancedFilters[fieldName] = { $ne: Number(value) };
            } else {
              advancedFilters[fieldName] = { $ne: value };
            }
            break;
          case 'gt':
            advancedFilters[fieldName] = { $gt: Number(value) };
            break;
          case 'gte':
            advancedFilters[fieldName] = { $gte: Number(value) };
            break;
          case 'lt':
            advancedFilters[fieldName] = { $lt: Number(value) };
            break;
          case 'lte':
            advancedFilters[fieldName] = { $lte: Number(value) };
            break;
        }
      } else {
        const value = req.query[key];
        if (!isNaN(Number(value))) {
          advancedFilters[key] = Number(value);
        } else if (value === 'true' || value === 'false') {
          advancedFilters[key] = value === 'true';
        } else {
          advancedFilters[key] = value;
        }
      }
    });
    
    if (Object.keys(advancedFilters).length > 0) {
      query = { 
        $and: [
          query,
          advancedFilters
        ]
      };
    }
    
    if (search) {
      const searchConditions = [
        { title: { $regex: search, $options: 'i' } },
        { body: { $regex: search, $options: 'i' } },
        { state: { $regex: search, $options: 'i' } }
      ];
      
      if (!isNaN(Number(search))) {
        searchConditions.push({ number: Number(search) });
        searchConditions.push({ githubId: Number(search) });
      }
      
      if (query.$and) {
        query.$and.push({ $or: searchConditions });
      } else {
        query = { 
          $and: [
            query, // Keep the original assigneeId filter
            { $or: searchConditions }
          ]
        };
      }
    }
    
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 25;
    const skip = (pageNum - 1) * limitNum;
    
    const sortField = sort || 'created_at';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortOptions = { [sortField]: sortDirection };
    
    console.log('Final query for user details:', JSON.stringify(query, null, 2));
    
    const total = await Model.countDocuments(query);
    
    const items = await Model.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const tableData = items.map(item => {
      const data = {
        id: item.number || item.githubId,
        title: item.title,
        state: item.state,
        created_at: item.created_at,
        updated_at: item.updated_at
      };
      
      if (modelName === 'Issue') {
        data.summary = item.title;
        data.description = item.body;
      } else if (modelName === 'PullRequest') {
        data.summary = item.title;
        data.description = item.body;
      }
      
      return data;
    });
    
    const fields = [
      { field: 'id', type: 'number' },
      { field: 'summary', type: 'string' },
      { field: 'description', type: 'string' },
      { field: 'state', type: 'string' },
      { field: 'created_at', type: 'date' }
    ];
    
    return res.status(200).json({
      success: true,
      count: items.length,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      totalRecords: total,
      userDetails,
      modelName,
      fields,
      data: tableData
    });
    
  } catch (error) {
    console.error('Error fetching user details:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
}; 

exports.searchAcrossAllCollections = async (req, res) => {
  try {
    const { userId } = req.params;
    const { search, collectionName } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    if (!search || search.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Search term is required'
      });
    }
    
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const skip = (page - 1) * limit;
    
    // Get all models except system models
    let modelNames = Object.keys(mongoose.models).filter(model => 
      !model.startsWith('_') && 
      !['User', 'Session'].includes(model)
    );
    
    // If a specific collection name is provided, only search in that collection
    if (collectionName && modelNames.includes(collectionName)) {
      modelNames = [collectionName];
    }
    
    let allResults = [];
    let totalMatchCount = 0;
    
    // Search across all models
    for (const modelName of modelNames) {
      const Model = mongoose.models[modelName];
      
      // Skip models without a userId field (not related to users)
      const hasUserIdField = Model.schema.path('userId');
      if (!hasUserIdField) continue;
      
      // Get all searchable string fields
      const stringFields = Object.keys(Model.schema.paths).filter(
        field => {
          const fieldType = Model.schema.paths[field].instance;
          return fieldType === 'String' && !field.startsWith('_');
        }
      );
      
      if (stringFields.length === 0) continue;
      
      // Build search query
      const searchConditions = stringFields.map(field => ({
        [field]: { $regex: search, $options: 'i' }
      }));
      
      // Add user filter
      const query = {
        userId: new ObjectId(userId),
        $or: searchConditions
      };
      
      // Count matching documents
      const total = await Model.countDocuments(query);
      totalMatchCount += total;
      
      if (total > 0) {
        // Get matching documents (paginated per collection)
        const results = await Model.find(query)
          .select(excludedFields)
          .skip(skip)
          .limit(limit)
          .lean();
        
        // Fields extraction
        const fields = extractDistinctFields(results).filter(x => !x.field.startsWith('_'));
        
        // Prepare response object for this collection
        allResults.push({
          collectionName: modelName,
          count: results.length,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          totalRecords: total,
          fields,
          data: results
        });
      }
    }
    
    // Sort collections by totalRecords (highest first)
    allResults.sort((a, b) => b.totalRecords - a.totalRecords);
    
    // If filtering by collection name, we don't need to paginate collections
    // Otherwise, paginate collections (not records)
    if (!collectionName) {
      allResults = allResults.slice(skip, skip + limit);
    }
    
    return res.status(200).json({
      success: true,
      count: allResults.length,
      totalPages: Math.ceil(allResults.length / limit),
      currentPage: page,
      totalRecords: allResults.length,
      totalMatches: totalMatchCount,
      data: allResults
    });
    
  } catch (error) {
    console.error('Error searching across collections:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
}; 