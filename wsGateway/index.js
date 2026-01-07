const http = require("http");
const socketIo = require('socket.io');
const jwt = require("jsonwebtoken");

const { read_rabbit_msg } = require("./utils/rabbit_mq.js");
const httpServer = http.createServer();
httpServer.listen(4000);

const io = socketIo(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    // options
});

io.on("connection", (socket) => {
    console.log("a user connected");

    const token = socket.handshake.auth.token;
    const projectId = socket.handshake.auth.projectId;
    if (token != null) {
        jwt.verify(token, process.env.JWT_SECRET_KEY, (e, payload) => {
            if (e) {
                socket.emit('authError', e);
                return;
            }

            console.log("Connecting to room:", payload.id)
            socket.join(payload.id);
        });
    }

    if (projectId) {
        console.log("Connecting to project room:", projectId);
        socket.join(projectId);
    }

    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

// id do user como room id

function process_msg() {
    read_rabbit_msg('ws_queue', (msg) => {
        const msg_content = JSON.parse(msg.content.toString());
        const msg_id = msg_content.messageId;
        const timestamp = msg_content.timestamp
        const status = msg_content.status;
        const user = msg_content.user;

        console.log('Received msg:', JSON.stringify(msg_content));

        if (status == "project-update") {
            const project_id = msg_content.project_id;
            io.to(project_id).emit("project-update", project_id);
            return;
        }

        if (status == "canceled") {
            const run_id = msg_content.run_id;
            const mode = msg_content.mode;

            if (mode == "preview") {
                io.to(user).emit("preview-canceled", run_id);
            } else {
                io.to(user).emit("process-canceled", run_id);
            }
            return;
        }

        if (/update-client-preview/.test(msg_id)) {
            if (status == "error") {
                const error_code = msg_content.errorCode;
                const error_msg = msg_content.errorMsg;
                const project_id = msg_content.project_id;

                io.to(user).emit("preview-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                if (project_id) {
                    io.to(project_id).emit("preview-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                }

                return;
            }

            const img_url = msg_content.img_url;
            const project_id = msg_content.project_id;

            io.to(user).emit("preview-ready", img_url);
            if (project_id) {
                io.to(project_id).emit("preview-ready", img_url);
            }
        }

        else if (/update-client-process/.test(msg_id)) {
            if (status == "error") {
                const error_code = msg_content.errorCode;
                const error_msg = msg_content.errorMsg;
                const project_id = msg_content.project_id;

                io.to(user).emit("process-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                if (project_id) {
                    io.to(project_id).emit("process-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                }

                return;
            }

            io.to(user).emit("process-update", msg_id);
            if (msg_content.project_id) {
                io.to(msg_content.project_id).emit("process-update", msg_id);
            }
        }

    })
}

process_msg();
