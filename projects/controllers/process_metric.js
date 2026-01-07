var ProcessMetric = require("../models/process_metric");

module.exports.create = async (metric) => {
  return await ProcessMetric.create(metric);
};

module.exports.getByProject = async (user_id, project_id, limit = 100) => {
  return await ProcessMetric.find({ user_id: user_id, project_id: project_id })
    .sort({ created_at: -1 })
    .limit(limit)
    .exec();
};
