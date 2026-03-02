import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const httpserver = http.createServer(app);
const io = new Server(httpserver, {
	cors: {
		origin: ["http://localhost:5173"],
	},
});

io.on("connection", (socket) => {
	console.log("what is socket: ", socket);
	console.log("Socket is active");

	socket.on("req_create_room", () => {
		const roomId = Math.random().toString(36).substring(2, 8);
		console.log("roomId: ", roomId);
		socket.join(roomId);
		socket.emit("res_create_room", { roomId });
	});

	// socket.on("chat", (payload) => {
	// 	console.log("payload: ", payload);
	// 	io.emit("chat", payload);
	// });
});

httpserver.listen(5000, () => {
	console.log("Server is listening");
});
