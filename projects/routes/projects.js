var express = require("express");
var router = express.Router();
const axios = require("axios");
const crypto = require("crypto");

const multer = require("multer");
const FormData = require("form-data");

const fs = require("fs");
const fs_extra = require("fs-extra");
const path = require("path");
const mime = require("mime-types");

const JSZip = require("jszip");

const { v4: uuidv4 } = require('uuid');

const {
  send_msg_tool,
  send_msg_client,
  send_msg_client_error,
  send_msg_client_preview,
  send_msg_client_preview_error,
  send_msg_client_cancel,
  send_msg_project_update,
  read_msg,
} = require("../utils/project_msg");

const Project = require("../controllers/project");
const Process = require("../controllers/process");
const ProcessMetric = require("../controllers/process_metric");
const Result = require("../controllers/result");
const Preview = require("../controllers/preview");
const ShareLink = require("../controllers/share_link");

const {
  get_image_docker,
  get_image_host,
  post_image,
  delete_image,
} = require("../utils/minio");

const storage = multer.memoryStorage();
var upload = multer({ storage: storage });

const key = fs.readFileSync(__dirname + "/../certs/selfsigned.key");
const cert = fs.readFileSync(__dirname + "/../certs/selfsigned.crt");

const https = require("https");
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // (NOTE: this will disable client verification)
  cert: cert,
  key: key,
});

const users_ms = "https://users:10001/";
const minio_domain = process.env.MINIO_DOMAIN;

const advanced_tools = [
  "cut_ai",
  "upgrade_ai",
  "bg_remove_ai",
  "text_ai",
  "obj_ai",
  "people_ai",
];

function advanced_tool_num(project) {
  const tools = project.tools;
  let ans = 0;

  for (let t of tools) {
    if (advanced_tools.includes(t.procedure)) ans++;
  }

  // Multiply answer by number of images to reduce chance of a single project with infinite images
  ans *= project.imgs.length;

  return ans;
}

// TODO process message according to type of output
function process_msg() {
  read_msg(async (msg) => {
    let process = null;
    try {
      const msg_content = JSON.parse(msg.content.toString());
      const msg_id = msg_content.correlationId;
      const timestamp = new Date().toISOString();

      const user_msg_id = `update-client-process-${uuidv4()}`;

      process = await Process.getOne(msg_id);
      if (!process) return;

      const project = await Project.getOne(process.user_id, process.project_id);
      if (!project) return;

      if (!project.processing) {
        project.processing = {
          active_run_id: null,
          active_preview_run_id: null,
          canceled_runs: [],
          canceled_preview_runs: [],
          updated_at: new Date(),
        };
      }

      const processing = project.processing;
      const is_preview = process.mode === "preview";
      const active_run_id = is_preview
        ? processing.active_preview_run_id
        : processing.active_run_id;
      const canceled_runs = is_preview
        ? processing.canceled_preview_runs || []
        : processing.canceled_runs || [];

      if (active_run_id !== process.run_id) return;
      if (canceled_runs.includes(process.run_id)) return;

      const prev_process_input_img = process.og_img_uri;
      const prev_process_output_img = process.new_img_uri;

      const processing_time =
        msg_content.metadata && msg_content.metadata.processingTime
          ? msg_content.metadata.processingTime
          : null;
      
      // Get current process, delete it and create it's sucessor if possible
      const og_img_uri = process.og_img_uri;
      const img_id = process.img_id;
      
      await Process.delete(process.user_id, process.project_id, process._id);
      
      if (msg_content.status === "error") {
        await recordProcessMetric(process, project, "error", processing_time);
        console.log(JSON.stringify(msg_content));
        if (/preview/.test(msg_id)) {
          send_msg_client_preview_error(
            `update-client-preview-${uuidv4()}`,
            timestamp,
            process.user_id,
            msg_content.error.code,
            msg_content.error.msg,
            process.project_id
          );
        }
        
        else {
          send_msg_client_error(
            user_msg_id,
            timestamp,
            process.user_id,
            msg_content.error.code,
            msg_content.error.msg,
            process.project_id
          );
        }
        return;
      }
      
      const output_file_uri = msg_content.output.imageURI;
      const type = msg_content.output.type;

      const next_pos = process.cur_pos + 1;

      if (/preview/.test(msg_id) && (type == "text" || next_pos >= project.tools.length)) {
        const file_path = path.join(__dirname, `/../${output_file_uri}`);
        const file_name = path.basename(file_path);
        const fileStream = fs.createReadStream(file_path); // Use createReadStream for efficiency

        const data = new FormData();
        await data.append(
          "file",
          fileStream,
          path.basename(file_path),
          mime.lookup(file_path)
        );

        const resp = await post_image(
          process.user_id,
          process.project_id,
          "preview",
          data
        );

        const og_key_tmp = resp.data.data.imageKey.split("/");
        const og_key = og_key_tmp[og_key_tmp.length - 1];

        
        const preview = {
          type: type,
          file_name: file_name,
          img_key: og_key,
          img_id: img_id,
          project_id: process.project_id,
          user_id: process.user_id,
        };
        
        await Preview.create(preview);

        if(next_pos >= project.tools.length){
          const previews = await Preview.getAll(process.user_id, process.project_id);

          let urls = {
            'imageUrl': '',
            'textResults': []
          };

          for(let p of previews){
            const url_resp = await get_image_host(
              process.user_id,
              process.project_id,
              "preview",
              p.img_key
            );

            const url = url_resp.data.url;

            if(p.type != "text") urls.imageUrl = url;

            else urls.textResults.push(url);
          }
          
          send_msg_client_preview(
            `update-client-preview-${uuidv4()}`,
            timestamp,
            process.user_id,
            JSON.stringify(urls),
            process.project_id
          );

        }
      }

      if (/preview/.test(msg_id) && next_pos >= project.tools.length) {
        const remaining = await Process.getByRunId(
          project._id,
          process.run_id,
        );
        if (remaining.length === 0) {
          project.processing.active_preview_run_id = null;
          project.processing.updated_at = new Date();
          await Project.update(project.user_id, project._id, project);
        }
        return;
      }

      await recordProcessMetric(process, project, "success", processing_time);

      if (!/preview/.test(msg_id))
        send_msg_client(
          user_msg_id,
          timestamp,
          process.user_id,
          process.project_id
        );

      if (!/preview/.test(msg_id) && (type == "text" || next_pos >= project.tools.length)) {
        const file_path = path.join(__dirname, `/../${output_file_uri}`);
        const file_name = path.basename(file_path);
        const fileStream = fs.createReadStream(file_path); // Use createReadStream for efficiency

        const data = new FormData();
        await data.append(
          "file",
          fileStream,
          path.basename(file_path),
          mime.lookup(file_path)
        );

        const resp = await post_image(
          process.user_id,
          process.project_id,
          "out",
          data
        );

        const og_key_tmp = resp.data.data.imageKey.split("/");
        const og_key = og_key_tmp[og_key_tmp.length - 1];

        const result = {
          type: type,
          file_name: file_name,
          img_key: og_key,
          img_id: img_id,
          project_id: process.project_id,
          user_id: process.user_id,
        };

        await Result.create(result);
      }

      if (next_pos >= project.tools.length) {
        const remaining = await Process.getByRunId(
          project._id,
          process.run_id,
        );
        if (remaining.length === 0) {
          project.processing.active_run_id = null;
          project.processing.updated_at = new Date();
          await Project.update(project.user_id, project._id, project);
        }
        return;
      }

      const new_msg_id = /preview/.test(msg_id)
        ? `preview-${uuidv4()}`
        : `request-${uuidv4()}`;

      const tool = project.tools.filter((t) => t.position == next_pos)[0];

      const tool_name = tool.procedure;
      const params = tool.params;

      const read_img = type == "text" ? prev_process_input_img : output_file_uri;
      const output_img = type == "text" ? prev_process_output_img : output_file_uri;

      const new_process = {
        user_id: project.user_id,
        project_id: project._id,
        img_id: img_id,
        msg_id: new_msg_id,
        run_id: process.run_id,
        mode: process.mode,
        cur_pos: next_pos,
        og_img_uri: read_img,
        new_img_uri: output_img,
      };

      // Making sure database entry is created before sending message to avoid conflicts
      await Process.create(new_process);
      send_msg_tool(
        new_msg_id,
        timestamp,
        new_process.og_img_uri,
        new_process.new_img_uri,
        tool_name,
        params
      );
    } catch (_) {
      if (process && process.user_id) {
        send_msg_client_error(
          `update-client-process-${uuidv4()}`,
          new Date().toISOString(),
          process.user_id,
          "30000",
          "An error happened while processing the project",
          process.project_id
        );
      }
      return;
    }
  });
}

async function getShareContext(token) {
  const share = await ShareLink.getByToken(token);
  if (!share || share.revoked) return null;

  const project = await Project.getOne(share.owner_id, share.project_id);
  if (!project) return null;

  await ShareLink.touchAccess(token);

  return { share, project };
}

function ensureShareEdit(share, res) {
  if (share.permission !== "edit") {
    res.status(403).jsonp("Link does not grant edit permissions");
    return false;
  }
  return true;
}

async function handlePreviewRequest(user_id, project_id, img_id, res) {
  const project = await Project.getOne(user_id, project_id);
  if (!project) {
    res.status(404).jsonp("Project not found");
    return;
  }

  if (!project.processing) {
    project.processing = {
      active_run_id: null,
      active_preview_run_id: null,
      canceled_runs: [],
      canceled_preview_runs: [],
      updated_at: new Date(),
    };
  }

  const prev_preview = await Preview.getAll(user_id, project_id);

  for (let p of prev_preview) {
    await delete_image(user_id, project_id, "preview", p.img_key);
    await Preview.delete(user_id, project_id, p.img_id);
  }

  const source_path = `/../images/users/${user_id}/projects/${project_id}/src`;
  const result_path = `/../images/users/${user_id}/projects/${project_id}/preview`;

  if (!fs.existsSync(path.join(__dirname, source_path)))
    fs.mkdirSync(path.join(__dirname, source_path), { recursive: true });

  if (!fs.existsSync(path.join(__dirname, result_path)))
    fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

  const img = project.imgs.filter((i) => i._id == img_id)[0];
  if (!img) {
    res.status(404).jsonp("No image with such id.");
    return;
  }

  const msg_id = `preview-${uuidv4()}`;
  const timestamp = new Date().toISOString();
  const og_img_uri = img.og_uri;
  const img_db_id = img._id;

  const resp = await get_image_docker(
    user_id,
    project_id,
    "src",
    img.og_img_key
  );
  const url = resp.data.url;

  const img_resp = await axios.get(url, { responseType: "stream" });

  const writer = fs.createWriteStream(og_img_uri);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
    img_resp.data.pipe(writer);
  });

  const img_name_parts = img.new_uri.split("/");
  const img_name = img_name_parts[img_name_parts.length - 1];
  const new_img_uri = `./images/users/${user_id}/projects/${project_id}/preview/${img_name}`;

  const tool = project.tools.filter((t) => t.position == 0)[0];
  if (!tool) {
    res.status(400).jsonp("No tools selected");
    return;
  }

  const run_id = `preview-${uuidv4()}`;
  project.processing.active_preview_run_id = run_id;
  project.processing.updated_at = new Date();
  await Project.update(user_id, project_id, project);

  const process = {
    user_id: user_id,
    project_id: project_id,
    img_id: img_db_id,
    msg_id: msg_id,
    run_id: project.processing.active_preview_run_id,
    mode: "preview",
    cur_pos: 0,
    og_img_uri: og_img_uri,
    new_img_uri: new_img_uri,
  };

  await Process.create(process);

  send_msg_tool(
    msg_id,
    timestamp,
    og_img_uri,
    new_img_uri,
    tool.procedure,
    tool.params
  );

  res.sendStatus(201);
}

async function handleProcessRequest(user_id, project_id, res) {
  const project = await Project.getOne(user_id, project_id);
  if (!project) {
    res.status(404).jsonp("Project not found");
    return;
  }

  if (!project.processing) {
    project.processing = {
      active_run_id: null,
      active_preview_run_id: null,
      canceled_runs: [],
      canceled_preview_runs: [],
      updated_at: new Date(),
    };
  }

  try {
    const prev_results = await Result.getAll(user_id, project_id);
    for (let r of prev_results) {
      await delete_image(user_id, project_id, "out", r.img_key);
      await Result.delete(r.user_id, r.project_id, r.img_id);
    }
  } catch (_) {
    res.status(400).jsonp("Error deleting previous results");
    return;
  }

  if (project.tools.length == 0) {
    res.status(400).jsonp("No tools selected");
    return;
  }

  const adv_tools = advanced_tool_num(project);
  let can_process = true;
  try {
    const resp = await axios.get(users_ms + `${user_id}/process/${adv_tools}`, {
      httpsAgent: httpsAgent,
    });
    can_process = resp.data;
  } catch (_) {
    res.status(400).jsonp(`Error checking if can process`);
    return;
  }

  if (!can_process) {
    res.status(404).jsonp("No more daily_operations available");
    return;
  }

  const run_id = `process-${uuidv4()}`;
  project.processing.active_run_id = run_id;
  project.processing.updated_at = new Date();
  project.processing.canceled_runs =
    project.processing.canceled_runs?.filter((id) => id !== run_id) || [];
  await Project.update(user_id, project_id, project);

  const source_path = `/../images/users/${user_id}/projects/${project_id}/src`;
  const result_path = `/../images/users/${user_id}/projects/${project_id}/out`;

  if (fs.existsSync(path.join(__dirname, source_path)))
    fs.rmSync(path.join(__dirname, source_path), {
      recursive: true,
      force: true,
    });

  fs.mkdirSync(path.join(__dirname, source_path), { recursive: true });

  if (fs.existsSync(path.join(__dirname, result_path)))
    fs.rmSync(path.join(__dirname, result_path), {
      recursive: true,
      force: true,
    });

  fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

  try {
    await Promise.all(
      project.imgs.map(async (img) => {
        const resp = await get_image_docker(
          user_id,
          project_id,
          "src",
          img.og_img_key
        );
        const url = resp.data.url;

        const img_resp = await axios.get(url, { responseType: "stream" });

        const writer = fs.createWriteStream(img.og_uri);

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
          img_resp.data.pipe(writer);
        });
      })
    );
  } catch (_) {
    res.status(400).jsonp("Error acquiring source images");
    return;
  }

  const tool = project.tools.filter((t) => t.position === 0)[0];

  const results = await Promise.allSettled(
    project.imgs.map(async (img) => {
      const msg_id = `request-${uuidv4()}`;
      const timestamp = new Date().toISOString();

      const og_img_uri = img.og_uri;
      const new_img_uri = img.new_uri;

      const process = {
        user_id: user_id,
        project_id: project_id,
        img_id: img._id,
        msg_id: msg_id,
        run_id: project.processing.active_run_id,
        mode: "process",
        cur_pos: 0,
        og_img_uri: og_img_uri,
        new_img_uri: new_img_uri,
      };

      await Process.create(process);
      send_msg_tool(
        msg_id,
        timestamp,
        og_img_uri,
        new_img_uri,
        tool.procedure,
        tool.params
      );
    })
  );

  const error = results.some((result) => result.status === "rejected");

  if (error)
    res
      .status(603)
      .jsonp(
        `There were some erros creating all process requests. Some results can be invalid.`
      );
  else res.sendStatus(201);
}

async function cancelProjectRun(user_id, project_id, mode) {
  const project = await Project.getOne(user_id, project_id);
  if (!project || !project.processing) return null;

  const is_preview = mode === "preview";
  const run_id = is_preview
    ? project.processing.active_preview_run_id
    : project.processing.active_run_id;

  if (!run_id) return null;

  if (is_preview) {
    project.processing.active_preview_run_id = null;
    project.processing.canceled_preview_runs =
      project.processing.canceled_preview_runs || [];
    if (!project.processing.canceled_preview_runs.includes(run_id)) {
      project.processing.canceled_preview_runs.push(run_id);
    }
  } else {
    project.processing.active_run_id = null;
    project.processing.canceled_runs = project.processing.canceled_runs || [];
    if (!project.processing.canceled_runs.includes(run_id)) {
      project.processing.canceled_runs.push(run_id);
    }
  }

  project.processing.updated_at = new Date();
  await Project.update(user_id, project_id, project);

  const processes = await Process.getByRunId(project._id, run_id);
  for (let p of processes) {
    await Process.delete(p.user_id, p.project_id, p._id);
  }

  return { project, run_id };
}

async function recordProcessMetric(process, project, status, processingTime) {
  try {
    const tool = project.tools.filter((t) => t.position == process.cur_pos)[0];
    if (!tool) return;

    await ProcessMetric.create({
      user_id: process.user_id,
      project_id: process.project_id,
      run_id: process.run_id,
      mode: process.mode,
      tool: tool.procedure,
      tool_pos: process.cur_pos,
      img_id: process.img_id,
      status: status,
      processing_time_ms: processingTime,
    });
  } catch (_) {
    return;
  }
}

// Share: access project by token (unauthenticated)
router.get("/share/:token", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");

    const { share, project } = ctx;

    const response = {
      _id: project._id,
      user_id: project.user_id,
      name: project.name,
      tools: project.tools,
      imgs: [],
      permission: share.permission,
    };

    for (let img of project.imgs) {
      const resp = await get_image_host(
        project.user_id,
        project._id,
        "src",
        img.og_img_key
      );
      response["imgs"].push({
        _id: img._id,
        name: path.basename(img.og_uri),
        url: resp.data.url,
      });
    }

    res.status(200).jsonp(response);
  } catch (_) {
    res.status(500).jsonp("Error acquiring shared project");
  }
});

router.get("/share/:token/imgs", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");

    const { project } = ctx;
    const ans = [];

    for (let img of project.imgs) {
      const resp = await get_image_host(
        project.user_id,
        project._id,
        "src",
        img.og_img_key
      );
      ans.push({
        _id: img._id,
        name: path.basename(img.og_uri),
        url: resp.data.url,
      });
    }

    res.status(200).jsonp(ans);
  } catch (_) {
    res.status(500).jsonp("Error acquiring shared project images");
  }
});

router.get("/share/:token/img/:img", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");

    const { project } = ctx;
    const img = project.imgs.filter((i) => i._id == req.params.img)[0];
    if (!img) return res.status(404).jsonp("No image with such id.");

    const resp = await get_image_host(
      project.user_id,
      project._id,
      "src",
      img.og_img_key
    );

    res.status(200).jsonp({
      _id: img._id,
      name: path.basename(img.og_uri),
      url: resp.data.url,
    });
  } catch (_) {
    res.status(500).jsonp("Error acquiring shared project image");
  }
});

router.get("/share/:token/process/url", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");

    const { project } = ctx;
    const results = await Result.getAll(project.user_id, project._id);

    const ans = { imgs: [], texts: [] };
    for (let r of results) {
      const resp = await get_image_host(
        project.user_id,
        project._id,
        "out",
        r.img_key
      );
      const url = resp.data.url;

      if (r.type == "text")
        ans.texts.push({ og_img_id: r.img_id, name: r.file_name, url: url });
      else ans.imgs.push({ og_img_id: r.img_id, name: r.file_name, url: url });
    }

    res.status(200).jsonp(ans);
  } catch (_) {
    res.status(500).jsonp("Error acquiring shared project results");
  }
});

// Share: manage links (authenticated)
router.get("/:user/:project/share", (req, res) => {
  ShareLink.getActiveByProject(req.params.user, req.params.project)
    .then((links) =>
      res.status(200).jsonp(
        links.map((link) => ({
          token: link.token,
          permission: link.permission,
          created_at: link.created_at,
        }))
      )
    )
    .catch((_) => res.status(500).jsonp("Error acquiring share links"));
});

router.post("/:user/:project/share", (req, res) => {
  const permission = req.body.permission;
  const has_unsaved = req.body.unsaved === true;

  if (has_unsaved) {
    res.status(409).jsonp("Save your project before sharing");
    return;
  }

  if (!["view", "edit"].includes(permission)) {
    res.status(400).jsonp("Invalid permission");
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const link = {
    token: token,
    project_id: req.params.project,
    owner_id: req.params.user,
    permission: permission,
  };

  ShareLink.create(link)
    .then((shareLink) =>
      res.status(201).jsonp({
        token: shareLink.token,
        permission: shareLink.permission,
        created_at: shareLink.created_at,
      })
    )
    .catch((_) => res.status(500).jsonp("Error creating share link"));
});

router.post("/:user/:project/share/:token/revoke", (req, res) => {
  ShareLink.revoke(req.params.token)
    .then((_) => res.sendStatus(204))
    .catch((_) => res.status(500).jsonp("Error revoking share link"));
});

router.post("/share/:token/tool", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");
    if (!ensureShareEdit(ctx.share, res)) return;

    const { project } = ctx;
    const tool = {
      position: project.tools.length,
      ...req.body,
    };

    project.tools.push(tool);
    await Project.update(project.user_id, project._id, project);

    send_msg_project_update(
      `update-project-${uuidv4()}`,
      new Date().toISOString(),
      project._id
    );

    res.sendStatus(201);
  } catch (_) {
    res.status(503).jsonp("Error updating shared project");
  }
});

router.put("/share/:token/tool/:tool", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");
    if (!ensureShareEdit(ctx.share, res)) return;

    const { project } = ctx;
    const tool_pos = project.tools.findIndex((i) => i._id == req.params.tool);
    if (tool_pos < 0)
      return res.status(404).jsonp("Error updating tool. Tool not found.");

    const prev_tool = project.tools[tool_pos];
    project.tools[tool_pos] = {
      position: prev_tool.position,
      procedure: prev_tool.procedure,
      params: req.body.params,
      _id: prev_tool._id,
    };

    await Project.update(project.user_id, project._id, project);

    send_msg_project_update(
      `update-project-${uuidv4()}`,
      new Date().toISOString(),
      project._id
    );

    res.sendStatus(204);
  } catch (_) {
    res.status(503).jsonp("Error updating shared project");
  }
});

router.delete("/share/:token/tool/:tool", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");
    if (!ensureShareEdit(ctx.share, res)) return;

    const { project } = ctx;
    const tool_pos = project.tools.findIndex((i) => i._id == req.params.tool);
    if (tool_pos < 0) return res.sendStatus(204);

    project.tools.splice(tool_pos, 1);
    project.tools = project.tools.map((t, idx) => ({
      ...t,
      position: idx,
    }));

    await Project.update(project.user_id, project._id, project);

    send_msg_project_update(
      `update-project-${uuidv4()}`,
      new Date().toISOString(),
      project._id
    );

    res.sendStatus(204);
  } catch (_) {
    res.status(503).jsonp("Error updating shared project");
  }
});

router.post("/share/:token/reorder", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");
    if (!ensureShareEdit(ctx.share, res)) return;

    const { project } = ctx;
    project.tools = [];

    for (let t of req.body) {
      project.tools.push({
        position: project.tools.length,
        ...t,
      });
    }

    await Project.update(project.user_id, project._id, project);

    send_msg_project_update(
      `update-project-${uuidv4()}`,
      new Date().toISOString(),
      project._id
    );

    res.sendStatus(204);
  } catch (_) {
    res.status(503).jsonp("Error updating shared project");
  }
});

router.post("/share/:token/preview/:img", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");
    if (!ensureShareEdit(ctx.share, res)) return;

    await handlePreviewRequest(
      ctx.project.user_id,
      ctx.project._id,
      req.params.img,
      res
    );
  } catch (_) {
    res.status(500).jsonp("Error creating shared preview");
  }
});

router.post("/share/:token/process", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");
    if (!ensureShareEdit(ctx.share, res)) return;

    await handleProcessRequest(ctx.project.user_id, ctx.project._id, res);
  } catch (_) {
    res.status(500).jsonp("Error processing shared project");
  }
});

router.post("/share/:token/process/cancel", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");
    if (!ensureShareEdit(ctx.share, res)) return;

    const result = await cancelProjectRun(
      ctx.project.user_id,
      ctx.project._id,
      "process"
    );
    if (!result) return res.sendStatus(204);
    res.sendStatus(204);
  } catch (_) {
    res.status(500).jsonp("Error canceling shared processing");
  }
});

router.post("/share/:token/preview/cancel", async (req, res) => {
  try {
    const ctx = await getShareContext(req.params.token);
    if (!ctx) return res.status(404).jsonp("Invalid or revoked link");
    if (!ensureShareEdit(ctx.share, res)) return;

    const result = await cancelProjectRun(
      ctx.project.user_id,
      ctx.project._id,
      "preview"
    );
    if (!result) return res.sendStatus(204);
    res.sendStatus(204);
  } catch (_) {
    res.status(500).jsonp("Error canceling shared preview");
  }
});

// Get list of all projects from a user
router.get("/:user", (req, res, next) => {
  Project.getAll(req.params.user)
    .then((projects) => {
      const ans = [];

      for (let p of projects) {
        ans.push({
          _id: p._id,
          name: p.name,
        });
      }

      res.status(200).jsonp(ans);
    })
    .catch((_) => res.status(500).jsonp("Error acquiring user's projects"));
});

// Get a specific user's project
router.get("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      const response = {
        _id: project._id,
        name: project.name,
        tools: project.tools,
        imgs: [],
      };

      for (let img of project.imgs) {
        try {
          const resp = await get_image_host(
            req.params.user,
            req.params.project,
            "src",
            img.og_img_key
          );
          const url = resp.data.url;

          response["imgs"].push({
            _id: img._id,
            name: path.basename(img.og_uri),
            url: url,
          });
        } catch (_) {
          res.status(404).jsonp(`Error acquiring image's url`);
          return;
        }
      }

      res.status(200).jsonp(response);
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get a specific project's image
router.get("/:user/:project/img/:img", async (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const img = project.imgs.filter((i) => i._id == req.params.img)[0];
        const resp = await get_image_host(
          req.params.user,
          req.params.project,
          "src",
          img.og_img_key
        );
        res.status(200).jsonp({
          _id: img._id,
          name: path.basename(img.og_uri),
          url: resp.data.url,
        });
      } catch (_) {
        res.status(404).jsonp("No image with such id.");
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get project images
router.get("/:user/:project/imgs", async (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const ans = [];

        for (let img of project.imgs) {
          try {
            const resp = await get_image_host(
              req.params.user,
              req.params.project,
              "src",
              img.og_img_key
            );
            const url = resp.data.url;

            ans.push({
              _id: img._id,
              name: path.basename(img.og_uri),
              url: url,
            });
          } catch (_) {
            res.status(404).jsonp(`Error acquiring image's url`);
            return;
          }
        }
        res.status(200).jsonp(ans);
      } catch (_) {
        res.status(404).jsonp("No image with such id.");
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get results of processing a project
router.get("/:user/:project/process", (req, res, next) => {
  // Getting last processed request from project in order to get their result's path

  Project.getOne(req.params.user, req.params.project)
    .then(async (_) => {
      const zip = new JSZip();
      const results = await Result.getAll(req.params.user, req.params.project);

      const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/tmp`;

      fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

      for (let r of results) {
        const res_path = path.join(__dirname, result_path, r.file_name);

        const resp = await get_image_docker(
          r.user_id,
          r.project_id,
          "out",
          r.img_key
        );
        const url = resp.data.url;

        const file_resp = await axios.get(url, { responseType: "stream" });
        const writer = fs.createWriteStream(res_path);

        // Use a Promise to handle the stream completion
        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
          file_resp.data.pipe(writer); // Pipe AFTER setting up the event handlers
        });

        const fs_res = fs.readFileSync(res_path);
        zip.file(r.file_name, fs_res);
      }

      fs.rmSync(path.join(__dirname, result_path), {
        recursive: true,
        force: true,
      });

      const ans = await zip.generateAsync({ type: "blob" });

      res.type(ans.type);
      res.set(
        "Content-Disposition",
        `attachment; filename=user_${req.params.user}_project_${req.params.project}_results.zip`
      );
      const b = await ans.arrayBuffer();
      res.status(200).send(Buffer.from(b));
    })
    .catch((_) =>
      res.status(601).jsonp(`Error acquiring project's processing result`)
    );
});


// Get results of processing a project
router.get("/:user/:project/process/url", (req, res, next) => {
  // Getting last processed request from project in order to get their result's path

  Project.getOne(req.params.user, req.params.project)
    .then(async (_) => {
      const ans = {
        'imgs': [],
        'texts': []
      };
      const results = await Result.getAll(req.params.user, req.params.project);

      for (let r of results) {
        const resp = await get_image_host(
          r.user_id,
          r.project_id,
          "out",
          r.img_key
        );
        const url = resp.data.url;

        if(r.type == 'text') ans.texts.push({ og_img_id : r.img_id, name: r.file_name, url: url })

        else ans.imgs.push({ og_img_id : r.img_id, name: r.file_name, url: url })
      }

      res.status(200).jsonp(ans);
    })
    .catch((_) =>
      res.status(601).jsonp(`Error acquiring project's processing result`)
    );
});


// Get number of advanced tools used in a project
router.get("/:user/:project/advanced_tools", (req, res, next) => {
  // Getting last processed request from project in order to get their result's path
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      const tools = project.tools;
      let ans = 0;

      for (let t of tools) {
        if (advanced_tools.includes(t.procedure)) ans++;
      }

      // Multiply answer by number of images to reduce chance of a single project with infinite images
      ans *= project.imgs.length;
      res.status(200).jsonp(ans);
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Create new project
router.post("/:user", (req, res, next) => {
  const project = {
    name: req.body.name,
    user_id: req.params.user,
    imgs: [],
    tools: [],
  };

  Project.create(project)
    .then((project) => res.status(201).jsonp(project))
    .catch((_) => res.status(502).jsonp(`Error creating new project`));
});

// Preview an image
router.post("/:user/:project/preview/:img", (req, res, next) => {
  handlePreviewRequest(
    req.params.user,
    req.params.project,
    req.params.img,
    res
  ).catch((_) =>
    res.status(603).jsonp(`Error creating preview process request`)
  );
});

// Add new image to a project
router.post(
  "/:user/:project/img",
  upload.single("image"),
  async (req, res, next) => {
    if (!req.file) {
      res.status(400).jsonp("No file found");
      return;
    }

    Project.getOne(req.params.user, req.params.project)
      .then(async (project) => {
        const same_name_img = project.imgs.filter(
          (i) => path.basename(i.og_uri) == req.file.originalname
        );

        if (same_name_img.length > 0) {
          res
            .status(400)
            .jsonp("This project already has an image with that name.");
          return;
        }

        try {
          const data = new FormData();
          data.append("file", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
          });
          const resp = await post_image(
            req.params.user,
            req.params.project,
            "src",
            data
          );

          const og_key_tmp = resp.data.data.imageKey.split("/");
          const og_key = og_key_tmp[og_key_tmp.length - 1];

          try {
            const og_uri = `./images/users/${req.params.user}/projects/${req.params.project}/src/${req.file.originalname}`;
            const new_uri = `./images/users/${req.params.user}/projects/${req.params.project}/out/${req.file.originalname}`;

            // Insert new image
            project["imgs"].push({
              og_uri: og_uri,
              new_uri: new_uri,
              og_img_key: og_key,
            });

            Project.update(req.params.user, req.params.project, project)
              .then((_) => res.sendStatus(204))
              .catch((_) =>
                res.status(503).jsonp(`Error updating project information`)
              );
          } catch (_) {
            res.status(501).jsonp(`Updating project information`);
          }
        } catch (_) {
          res.status(501).jsonp(`Error storing image`);
        }
      })
      .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
  }
);

// Add new tool to a project
router.post("/:user/:project/tool", (req, res, next) => {
  // Reject posts to tools that don't fullfil the requirements
  if (!req.body.procedure || !req.body.params) {
    res
      .status(400)
      .jsonp(`A tool should have a procedure and corresponding parameters`);
    return;
  }

  let required_types = ["free", "premium"];

  if (!advanced_tools.includes(req.body.procedure))
    required_types.push("anonymous");

  axios
    .get(users_ms + `${req.params.user}/type`, { httpsAgent: httpsAgent })
    .then((resp) => {
      // Check user type before proceeding
      if (!required_types.includes(resp.data.type)) {
        return res.status(403).jsonp(`User type can't use this tool`); // Return a 403 Forbidden
      }

      // Get project and insert new tool
      Project.getOne(req.params.user, req.params.project)
        .then((project) => {
          const tool = {
            position: project["tools"].length,
            ...req.body,
          };

          project["tools"].push(tool);

          Project.update(req.params.user, req.params.project, project)
            .then((_) => {
              send_msg_project_update(
                `update-project-${uuidv4()}`,
                new Date().toISOString(),
                project._id
              );
              res.sendStatus(204);
            })
            .catch((_) =>
              res.status(503).jsonp(`Error updating project information`)
            );
        })
        .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
    })
    .catch((_) => res.send(401).jsonp(`Error accessing picturas-user-ms`));
});

// Reorder tools of a project
router.post("/:user/:project/reorder", (req, res, next) => {
  // Remove all tools from project and reinsert them according to new order
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      project["tools"] = [];

      for (let t of req.body) {
        const tool = {
          position: project["tools"].length,
          ...t,
        };

        project["tools"].push(tool);
      }

      Project.update(req.params.user, req.params.project, project)
        .then((project) => {
          send_msg_project_update(
            `update-project-${uuidv4()}`,
            new Date().toISOString(),
            project._id
          );
          res.status(204).jsonp(project);
        })
        .catch((_) =>
          res.status(503).jsonp(`Error updating project information`)
        );
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Process a specific project
router.post("/:user/:project/process", (req, res, next) => {
  handleProcessRequest(req.params.user, req.params.project, res).catch((_) =>
    res.status(501).jsonp(`Error acquiring user's project`)
  );
});

// Cancel a project's processing
router.post("/:user/:project/process/cancel", (req, res, next) => {
  cancelProjectRun(req.params.user, req.params.project, "process")
    .then((result) => {
      if (!result) return res.sendStatus(204);

      const timestamp = new Date().toISOString();
      send_msg_client_cancel(
        `update-client-cancel-${uuidv4()}`,
        timestamp,
        result.project.user_id,
        result.run_id,
        "process",
      );

      res.sendStatus(204);
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get recent processing metrics for a project
router.get("/:user/:project/metrics", (req, res) => {
  const limit = parseInt(req.query.limit || "100");
  ProcessMetric.getByProject(req.params.user, req.params.project, limit)
    .then((metrics) => res.status(200).jsonp(metrics))
    .catch((_) => res.status(500).jsonp("Error acquiring project metrics"));
});

// Cancel a project's preview processing
router.post("/:user/:project/preview/cancel", (req, res, next) => {
  cancelProjectRun(req.params.user, req.params.project, "preview")
    .then((result) => {
      if (!result) return res.sendStatus(204);

      const timestamp = new Date().toISOString();
      send_msg_client_cancel(
        `update-client-cancel-${uuidv4()}`,
        timestamp,
        result.project.user_id,
        result.run_id,
        "preview",
      );

      res.sendStatus(204);
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Update a specific project
router.put("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      project.name = req.body.name || project.name;
      Project.update(req.params.user, req.params.project, project)
        .then((_) => {
          send_msg_project_update(
            `update-project-${uuidv4()}`,
            new Date().toISOString(),
            project._id
          );
          res.sendStatus(204);
        })
        .catch((_) =>
          res.status(503).jsonp(`Error updating project information`)
        );
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Update a tool from a specific project
router.put("/:user/:project/tool/:tool", (req, res, next) => {
  // Get project and update required tool with new data, keeping it's original position and procedure
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      try {
        const tool_pos = project["tools"].findIndex(
          (i) => i._id == req.params.tool
        );
        const prev_tool = project["tools"][tool_pos];

        project["tools"][tool_pos] = {
          position: prev_tool.position,
          procedure: prev_tool.procedure,
          params: req.body.params,
          _id: prev_tool._id,
        };

        Project.update(req.params.user, req.params.project, project)
          .then((_) => {
            send_msg_project_update(
              `update-project-${uuidv4()}`,
              new Date().toISOString(),
              project._id
            );
            res.sendStatus(204);
          })
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res
          .status(599)
          .jsonp(`Error updating tool. Make sure such tool exists`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Delete a project
router.delete("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project).then(async (project) => {
    // Remove all images related to the project from the file system
    const previous_img = JSON.parse(JSON.stringify(project["imgs"]));
    for (let img of previous_img) {
      await delete_image(
        req.params.user,
        req.params.project,
        "src",
        img.og_img_key
      );
      project["imgs"].remove(img); // Not really needed, but in case of error serves as reference point
    }

    const results = await Result.getAll(req.params.user, req.params.project);

    const previews = await Preview.getAll(req.params.user, req.params.project);

    for (let r of results) {
      await delete_image(req.params.user, req.params.project, "out", r.img_key);
      await Result.delete(r.user_id, r.project_id, r.img_id);
    }

    for (let p of previews) {
      await delete_image(
        req.params.user,
        req.params.project,
        "preview",
        p.img_key
      );
      await Preview.delete(p.user_id, p.project_id, p.img_id);
    }

    Project.delete(req.params.user, req.params.project)
      .then((_) => res.sendStatus(204))
      .catch((_) => res.status(504).jsonp(`Error deleting user's project`));
  });
});

// Delete an image from a project
router.delete("/:user/:project/img/:img", (req, res, next) => {
  // Get project and delete specified image
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const img = project["imgs"].filter((i) => i._id == req.params.img)[0];

        await delete_image(
          req.params.user,
          req.params.project,
          "src",
          img.og_img_key
        );
        project["imgs"].remove(img);

        const results = await Result.getOne(
          req.params.user,
          req.params.project,
          img._id
        );

        const previews = await Preview.getOne(
          req.params.user,
          req.params.project,
          img._id
        );

        if (results !== null && results !== undefined) {
          await delete_image(
            req.params.user,
            req.params.project,
            "out",
            results.img_key
          );
          await Result.delete(
            results.user_id,
            results.project_id,
            results.img_id
          );
        }

        if (previews !== null && previews !== undefined) {
          await delete_image(
            req.params.user,
            req.params.project,
            "preview",
            previews.img_key
          );
          await Preview.delete(
            previews.user_id,
            previews.project_id,
            previews.img_id
          );
        }

        Project.update(req.params.user, req.params.project, project)
          .then((_) => {
            send_msg_project_update(
              `update-project-${uuidv4()}`,
              new Date().toISOString(),
              project._id
            );
            res.sendStatus(204);
          })
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res.status(400).jsonp(`Error deleting image information.`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Delete a tool from a project
router.delete("/:user/:project/tool/:tool", (req, res, next) => {
  // Get project and delete specified tool, updating the position of all tools that follow
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      try {
        const tool = project["tools"].filter(
          (i) => i._id == req.params.tool
        )[0];

        project["tools"].remove(tool);

        for (let i = 0; i < project["tools"].length; i++) {
          if (project["tools"][i].position > tool.position)
            project["tools"][i].position--;
        }

        Project.update(req.params.user, req.params.project, project)
          .then((_) => res.sendStatus(204))
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res.status(400).jsonp(`Error deleting tool's information`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

module.exports = { router, process_msg };
