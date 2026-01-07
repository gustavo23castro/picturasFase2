const mongoose = require("mongoose");

const shareLinkSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  project_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  owner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  permission: { type: String, enum: ["view", "edit"], required: true },
  revoked: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  revoked_at: { type: Date, default: null },
  last_access_at: { type: Date, default: null },
});

module.exports = mongoose.model("share_link", shareLinkSchema);
