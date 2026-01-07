const mongoose = require("mongoose");

const processMetricSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  project_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  run_id: { type: String, required: true },
  mode: { type: String, enum: ["process", "preview"], required: true },
  tool: { type: String, required: true },
  tool_pos: { type: Number, required: true },
  img_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ["success", "error"], required: true },
  processing_time_ms: { type: Number, default: null },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("process_metric", processMetricSchema);
