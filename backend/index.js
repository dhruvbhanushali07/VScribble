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

const rooms = {};
/* It will look like this when populated:
  {
    "X7B9": { players: ["socketId1", "socketId2"], maxPlayers: 8 },
    "A1Z2": { players: ["socketId3"], maxPlayers: 8 }
  }
*/

io.on("connection", (socket) => {
	console.log("New socket connected: ", socket.id);

	socket.on("req_create_room", (username) => {
		let roomId;

		do {
			roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
		} while (rooms[roomId]);

		const roomOwner = {
			id: socket.id,
			username: username,
		};

		rooms[roomId] = {
			players: [roomOwner], // Add the creator as the first player
		};

		socket.join(roomId);

		// Send success back to the creator
		socket.emit("res_create_room", {
			roomId: roomId,
			playerArr: rooms[roomId].players,
		});
		console.log("Current Active Rooms: ", rooms);
		console.log(rooms[roomId].players);
	});

	socket.on("join_room", (roomId, username) => {
		console.log(
			`Socket ${socket.id} with username: ${username} is trying to join room ${roomId}`,
		);
		if (!rooms[roomId]) {
			return socket.emit("room_error", "This room does not exist.");
		}

		if (rooms[roomId].players.length >= rooms[roomId].maxPlayers) {
			return socket.emit("room_error", "This room is full.");
		}

		let player = {
			id: socket.id,
			username: username
		};

		rooms[roomId].players.push(player);
		socket.join(roomId);

		console.log(`Socket ${socket.id} joined room ${roomId}`);

		socket.emit("join_success", {
			roomId: roomId,
			playerArr: rooms[roomId].players,
		});

		socket.to(roomId).emit("player_joined", {
			message: ` ${username} has joined!`,
			playerArr: rooms[roomId].players,
		});
	});

	socket.on("chat_message", (payload) => {
		console.log(
			`New message: ${payload.message.text} , in room: ${payload.roomId} by userid: ${payload.userId}`,
		);
		io.to(payload.roomId).emit("receive_message", {
			id: payload.message.id,
			text: payload.message.text,
		});
	});

	socket.on("disconnect", () => {
		console.log("Socket disconnected: ", socket.id);
		// You will eventually need logic here to loop through `rooms`,
		// find which room this socket.id was in, and remove them from the `players` array.
		// If the array hits 0, delete the room from the object so it doesn't leak memory!
	});

	console.log(rooms);
});

httpserver.listen(5000, () => {
	console.log("Server is listening on port 5000");
});
