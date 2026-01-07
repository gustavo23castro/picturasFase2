var ShareLink = require("../models/share_link");

module.exports.getByToken = async (token) => {
  return await ShareLink.findOne({ token: token }).exec();
};

module.exports.getActiveByProject = async (owner_id, project_id) => {
  return await ShareLink.find({
    owner_id: owner_id,
    project_id: project_id,
    revoked: false,
  })
    .sort({ created_at: -1 })
    .exec();
};

module.exports.create = async (shareLink) => {
  return await ShareLink.create(shareLink);
};

module.exports.revoke = async (token) => {
  return await ShareLink.updateOne(
    { token: token },
    { revoked: true, revoked_at: new Date() },
  );
};

module.exports.touchAccess = async (token) => {
  return await ShareLink.updateOne(
    { token: token },
    { last_access_at: new Date() },
  );
};
