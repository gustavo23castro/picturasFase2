var express = require("express");
var router = express.Router();

const axios = require("axios");

const https = require("https");
const fs = require("fs");

const multer = require("multer");
const FormData = require("form-data");

const auth = require("../auth/auth");

const key = fs.readFileSync(__dirname + "/../certs/selfsigned.key");
const cert = fs.readFileSync(__dirname + "/../certs/selfsigned.crt");

const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // (NOTE: this will disable client verification)
  cert: cert,
  key: key,
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const projectsURL = "https://projects:9001/";

// TODO Verify jwt

/*
Project structure
{
    "_id": Mongoose.type.id,
    "user_id": Mongoose.type.id,
    "name": String,
    "imgs": [Image Structure],
    "tools": [Tool Structure],
}

Image structure
{
    "_id": Mongoose.type.id,
    "og_uri": String,
    "new_uri": String
}

Tool structure
{
    "_id": Mongoose.type._id,
    "position": Number,
    "procedure": String,
    "params": Object
}

Post answer structure in case of success
{
    "acknowledged": Bool,
    "modifiedCount": Number,
    "upsertedId": null,
    "upsertedCount": Number,
    "matchedCount": Number
}
*/

/**
 * Note: auth.checkToken is a midleware used to verify JWT
 */

/**
 * Share access (unauthenticated)
 */
router.get("/share/:token", function (req, res, next) {
  axios
    .get(projectsURL + `share/${req.params.token}`, { httpsAgent: httpsAgent })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(404).jsonp("Invalid or revoked link"));
});

router.get("/share/:token/imgs", function (req, res, next) {
  axios
    .get(projectsURL + `share/${req.params.token}/imgs`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(404).jsonp("Invalid or revoked link"));
});

router.get("/share/:token/img/:img", function (req, res, next) {
  axios
    .get(projectsURL + `share/${req.params.token}/img/${req.params.img}`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(404).jsonp("Invalid or revoked link"));
});

router.get("/share/:token/process/url", function (req, res, next) {
  axios
    .get(projectsURL + `share/${req.params.token}/process/url`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting processing results"));
});

router.post("/share/:token/tool", function (req, res, next) {
  axios
    .post(projectsURL + `share/${req.params.token}/tool`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.sendStatus(resp.status))
    .catch((err) => res.status(500).jsonp("Error adding tool"));
});

router.put("/share/:token/tool/:tool", function (req, res, next) {
  axios
    .put(
      projectsURL + `share/${req.params.token}/tool/${req.params.tool}`,
      req.body,
      { httpsAgent: httpsAgent }
    )
    .then((resp) => res.sendStatus(resp.status))
    .catch((err) => res.status(500).jsonp("Error updating tool"));
});

router.delete("/share/:token/tool/:tool", function (req, res, next) {
  axios
    .delete(
      projectsURL + `share/${req.params.token}/tool/${req.params.tool}`,
      { httpsAgent: httpsAgent }
    )
    .then((resp) => res.sendStatus(resp.status))
    .catch((err) => res.status(500).jsonp("Error deleting tool"));
});

router.post("/share/:token/reorder", function (req, res, next) {
  axios
    .post(projectsURL + `share/${req.params.token}/reorder`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.sendStatus(resp.status))
    .catch((err) => res.status(500).jsonp("Error reordering tools"));
});

router.post("/share/:token/preview/:img", function (req, res, next) {
  axios
    .post(
      projectsURL + `share/${req.params.token}/preview/${req.params.img}`,
      req.body,
      { httpsAgent: httpsAgent }
    )
    .then((resp) => res.sendStatus(resp.status))
    .catch((err) => res.status(500).jsonp("Error requesting preview"));
});

router.post("/share/:token/process", function (req, res, next) {
  axios
    .post(projectsURL + `share/${req.params.token}/process`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.sendStatus(resp.status))
    .catch((err) => res.status(500).jsonp("Error requesting processing"));
});

router.post("/share/:token/process/cancel", function (req, res, next) {
  axios
    .post(projectsURL + `share/${req.params.token}/process/cancel`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.sendStatus(resp.status))
    .catch((err) => res.status(500).jsonp("Error canceling processing"));
});

router.post("/share/:token/preview/cancel", function (req, res, next) {
  axios
    .post(projectsURL + `share/${req.params.token}/preview/cancel`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.sendStatus(resp.status))
    .catch((err) => res.status(500).jsonp("Error canceling preview"));
});

/**
 * Get user's projects
 * @body Empty
 * @returns List of projects, each project has no information about it's images or tools
 */
router.get("/:user", auth.checkToken, function (req, res, next) {
  axios
    .get(projectsURL + `${req.params.user}`, { httpsAgent: httpsAgent })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting users"));
});

/**
 * Get user's project
 * @body Empty
 * @returns The required project
 */
router.get("/:user/:project", auth.checkToken, function (req, res, next) {
  axios
    .get(projectsURL + `${req.params.user}/${req.params.project}`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting project"));
});

/**
 * Share management (authenticated)
 */
router.get("/:user/:project/share", auth.checkToken, function (req, res, next) {
  axios
    .get(projectsURL + `${req.params.user}/${req.params.project}/share`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting share links"));
});

router.post("/:user/:project/share", auth.checkToken, function (req, res, next) {
  axios
    .post(projectsURL + `${req.params.user}/${req.params.project}/share`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error creating share link"));
});

router.post(
  "/:user/:project/share/:token/revoke",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL +
          `${req.params.user}/${req.params.project}/share/${req.params.token}/revoke`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.sendStatus(resp.status))
      .catch((err) => res.status(500).jsonp("Error revoking share link"));
  }
);

/**
 * Get project image
 * @body Empty
 * @returns The image url
 */
router.get(
  "/:user/:project/img/:img",
  auth.checkToken,
  function (req, res, next) {
    axios
      .get(
        projectsURL +
          `${req.params.user}/${req.params.project}/img/${req.params.img}`,
        {
          httpsAgent: httpsAgent,
        }
      )
      .then((resp) => {
        res.status(200).send(resp.data);
      })
      .catch((err) => res.status(500).jsonp("Error getting project image"));
  }
);

/**
 * Get project images
 * @body Empty
 * @returns The project's images
 */
router.get("/:user/:project/imgs", auth.checkToken, function (req, res, next) {
  axios
    .get(projectsURL + `${req.params.user}/${req.params.project}/imgs`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => {
      res.status(200).send(resp.data);
    })
    .catch((err) => res.status(500).jsonp("Error getting project images"));
});

/**
 * Get project's processment result
 * @body Empty
 * @returns The required results, sent as a zip
 */
router.get(
  "/:user/:project/process",
  auth.checkToken,
  function (req, res, next) {
    axios
      .get(projectsURL + `${req.params.user}/${req.params.project}/process`, {
        httpsAgent: httpsAgent,
        responseType: "arraybuffer",
      })
      .then((resp) => res.status(200).send(resp.data))
      .catch((err) =>
        res.status(500).jsonp("Error getting processing results file")
      );
  }
);

/**
 * Get project's processment result
 * @body Empty
 * @returns The required results, sent as [{img_id, img_name, url}]
 */
router.get(
  "/:user/:project/process/url",
  auth.checkToken,
  function (req, res, next) {
    axios
      .get(
        projectsURL + `${req.params.user}/${req.params.project}/process/url`,
        {
          httpsAgent: httpsAgent,
        }
      )
      .then((resp) => {
        res.status(200).send(resp.data);
      })
      .catch((err) =>
        res.status(500).jsonp("Error getting processing results")
      );
  }
);

/**
 * Get project metrics
 * @body Empty
 * @returns Recent processing metrics
 */
router.get(
  "/:user/:project/metrics",
  auth.checkToken,
  function (req, res, next) {
    const limit = req.query.limit ? `?limit=${req.query.limit}` : "";
    axios
      .get(
        projectsURL + `${req.params.user}/${req.params.project}/metrics${limit}`,
        {
          httpsAgent: httpsAgent,
        }
      )
      .then((resp) => res.status(200).send(resp.data))
      .catch((err) => res.status(500).jsonp("Error getting project metrics"));
  }
);

/**
 * Create new user's project
 * @body { "name": String }
 * @returns Created project's data
 */
router.post("/:user", auth.checkToken, function (req, res, next) {
  axios
    .post(projectsURL + `${req.params.user}`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error creating new project"));
});

/**
 * Preview an image
 * @body Empty
 * @returns String indication preview is being processed
 */
router.post(
  "/:user/:project/preview/:img",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL +
          `${req.params.user}/${req.params.project}/preview/${req.params.img}`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => {
        console.log(err);
        res.status(500).jsonp("Error requesting image preview");
      });
  }
);

/**
 * Cancel processing or preview
 */
router.post(
  "/:user/:project/process/cancel",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL + `${req.params.user}/${req.params.project}/process/cancel`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.sendStatus(resp.status))
      .catch((err) => res.status(500).jsonp("Error canceling processing"));
  }
);

router.post(
  "/:user/:project/preview/cancel",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL + `${req.params.user}/${req.params.project}/preview/cancel`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.sendStatus(resp.status))
      .catch((err) => res.status(500).jsonp("Error canceling preview"));
  }
);

/**
 * Add image to project
 * @body Empty
 * @file Image to be added
 * @returns Post answer structure in case of success
 */
router.post(
  "/:user/:project/img",
  upload.single("image"),
  auth.checkToken,
  function (req, res, next) {
    const data = new FormData();
    data.append("image", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    axios
      .post(
        projectsURL + `${req.params.user}/${req.params.project}/img`,
        data,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          httpsAgent: httpsAgent,
        }
      )
      .then((resp) => res.sendStatus(201))
      .catch((err) => res.status(500).jsonp("Error adding image to project"));
  }
);

/**
 * Add tool to project
 * @body { "procedure": String, "params": Object }
 * @returns Post answer structure in case of success
 */
router.post("/:user/:project/tool", auth.checkToken, function (req, res, next) {
  axios
    .post(
      projectsURL + `${req.params.user}/${req.params.project}/tool`,
      req.body,
      { httpsAgent: httpsAgent }
    )
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error adding tool to project"));
});

/**
 * Reorder tools of a project
 * @body [{ "position": Number, "procedure": String, "params": Object }] (Position is a unique number between 0 and req.body.length - 1)
 * @returns Post answer structure in case of success
 */
router.post(
  "/:user/:project/reorder",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL + `${req.params.user}/${req.params.project}/reorder`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => res.status(500).jsonp("Error reordering tools"));
  }
);

/**
 * Generate request to process a project
 * @body Empty
 * @returns String indicating process request has been created
 */
router.post(
  "/:user/:project/process",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL + `${req.params.user}/${req.params.project}/process`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) =>
        res.status(500).jsonp("Error requesting project processing")
      );
  }
);

/**
 * Update a specific project
 * @body { "name": String }
 * @returns Empty
 */
router.put("/:user/:project", auth.checkToken, function (req, res, next) {
  axios
    .put(projectsURL + `${req.params.user}/${req.params.project}`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((_) => res.sendStatus(204))
    .catch((err) => res.status(500).jsonp("Error updating project details"));
});

/**
 * Update a tool from a project
 * @body { "params" : Object }
 * @returns Empty
 */
router.put(
  "/:user/:project/tool/:tool",
  auth.checkToken,
  function (req, res, next) {
    axios
      .put(
        projectsURL +
          `${req.params.user}/${req.params.project}/tool/${req.params.tool}`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((_) => res.sendStatus(204))
      .catch((err) => res.status(500).jsonp("Error updating tool params"));
  }
);

/**
 * Delete a user's project
 * @body Empty
 * @returns Empty
 */
router.delete("/:user/:project", auth.checkToken, function (req, res, next) {
  axios
    .delete(projectsURL + `${req.params.user}/${req.params.project}`, {
      httpsAgent: httpsAgent,
    })
    .then((_) => res.sendStatus(204))
    .catch((err) => res.status(500).jsonp("Error deleting project"));
});

/**
 * Remove an image from a user's project
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/:user/:project/img/:img",
  auth.checkToken,
  function (req, res, next) {
    axios
      .delete(
        projectsURL +
          `${req.params.user}/${req.params.project}/img/${req.params.img}`,
        { httpsAgent: httpsAgent }
      )
      .then((_) => res.sendStatus(204))
      .catch((err) =>
        res.status(500).jsonp("Error deleting image from project")
      );
  }
);

/**
 * Remove a tool from a user's project
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/:user/:project/tool/:tool",
  auth.checkToken,
  function (req, res, next) {
    axios
      .delete(
        projectsURL +
          `${req.params.user}/${req.params.project}/tool/${req.params.tool}`,
        { httpsAgent: httpsAgent }
      )
      .then((_) => res.sendStatus(204))
      .catch((err) =>
        res.status(500).jsonp("Error removing tool from project")
      );
  }
);

module.exports = router;
