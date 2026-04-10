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

const WORD_LIST = [
	"APPLE",
	"BANANA",
	"ELEPHANT",
	"PIZZA",
	"GUITAR",
	"MOUNTAIN",
	"ASTRONAUT",
	"CASTLE",
	"BICYCLE",
	"OCEAN",
	// Add more words!
];

const rooms = {};

io.on("connection", (socket) => {
	console.log("New socket connected: ", socket.id);

	// ==========================================
	// 1. ROOM CREATION & JOINING
	// ==========================================
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
			players: [roomOwner],
			status: "LOBBY",
			round: 1,
			usedWords: [],
			scores: {},
			timerInterval: null,

			// --- NEW: Configurable Settings ---
			settings: {
				maxPlayers: 8,
				drawTime: 90,
				maxRounds: 3,
				wordCount: 3,
				hints: 2,
			},

			// --- NEW: Nested Turn State ---
			currentTurn: {
				drawerId: null,
				word: "",
				correctGuessers: [], // Array of socket IDs who guessed correctly
				timeLeft: 0,
			},
		};

		socket.join(roomId);
		socket.emit("res_create_room", {
			roomId,
			playerArr: rooms[roomId].players,
		});
	});

	socket.on("join_room", (roomId, username) => {
		const room = rooms[roomId];
		if (!room)
			return socket.emit("room_error", "This room does not exist.");
		if (room.players.length >= room.settings.maxPlayers)
			return socket.emit("room_error", "This room is full.");
		if (room.status !== "LOBBY")
			return socket.emit("room_error", "Game is already in progress.");

		let player = { id: socket.id, username: username };
		room.players.push(player);
		socket.join(roomId);

		socket.emit("join_success", { roomId, playerArr: room.players });
		socket.to(roomId).emit("player_joined", { playerArr: room.players });

		io.to(roomId).emit("receive_message", {
			username: "System",
			text: `${username} has joined the room.`,
			isSystemMsg: true,
		});
	});

	// ==========================================
	// 2. HOST SETTINGS & SECURITY
	// ==========================================
	socket.on("update_settings", (payload) => {
		const room = rooms[payload.roomId];
		if (!room) return;

		// SECURITY PATCH: Only the host (player[0]) can change settings
		if (room.players[0].id !== socket.id) return;

		// Update settings with validation
		room.settings.maxPlayers = payload.maxPlayers || 8;
		room.settings.drawTime = payload.drawTime || 90;
		room.settings.maxRounds = Math.max(2, payload.maxRounds || 3); // Min 2 rounds
		room.settings.wordCount = payload.wordCount || 3;
		room.settings.hints = payload.hints || 2;

		socket.to(payload.roomId).emit("settings_updated", room.settings);
	});

	socket.on("start_game", (roomId) => {
		const room = rooms[roomId];
		if (!room || room.players.length < 2 || room.status !== "LOBBY") return;

		if (room.players[0].id !== socket.id) return;

		// TOTAL WIPE: Clear the object entirely before setting new scores
		room.scores = {};
		room.players.forEach((p) => (room.scores[p.id] = 0));
		room.round = 1;
		room.usedWords = [];

		startRound(roomId);
	});

	// ==========================================
	// 3. CANVAS SYNCING (WITH SECURITY)
	// ==========================================
	socket.on("draw_event", (payload) => {
		const room = rooms[payload.roomId];
		if (!room) return;

		// SECURITY PATCH: Reject drawing if it's not this socket's turn
		if (room.currentTurn.drawerId !== socket.id) return;

		socket.to(payload.roomId).emit("draw_event", payload);
	});

	socket.on("clear_canvas", (roomId) => {
		const room = rooms[roomId];
		if (!room || room.currentTurn.drawerId !== socket.id) return;
		socket.to(roomId).emit("clear_canvas");
	});

	// ==========================================
	// 4. CHAT & SCORING SYSTEM
	// ==========================================
	socket.on("chat_message", (payload) => {
		const room = rooms[payload.roomId];
		if (!room) return;

		const player = room.players.find((p) => p.id === socket.id);
		const username = player ? player.username : "Unknown";
		const guessedWord = payload.text.trim().toUpperCase();
		const turn = room.currentTurn;

		// If game is active, checking guesses
		if (room.status === "DRAWING" && turn.word) {
			// If they are the drawer, or already guessed correctly, block them from typing the answer
			if (
				socket.id === turn.drawerId ||
				turn.correctGuessers.includes(socket.id)
			) {
				if (guessedWord === turn.word) return; // Ignore message
			}

			// Check for correct guess
			if (guessedWord === turn.word) {
				turn.correctGuessers.push(socket.id);

				// Track the time of the VERY FIRST correct guess for drawer bonus
				if (turn.correctGuessers.length === 1) {
					turn.firstGuessTimeLeft = turn.timeLeft;
				}

				// -- SCORING MATH (RANK-BASED: OPTION B) --
				const rank = turn.correctGuessers.length;

				// 1st = 100, 2nd = 80, 3rd = 60... drops by 20 each time, minimum of 10 points.
				let points = Math.max(10, 100 - (rank - 1) * 20);

				// SAVE DELTA (Points earned THIS turn)
				turn.turnScores[socket.id] = points;
				// ADD TO TOTAL
				room.scores[socket.id] += points;

				io.to(payload.roomId).emit("receive_message", {
					username: username,
					text: "",
					isCorrectGuess: true,
				});

				// Check if everyone has guessed
				if (turn.correctGuessers.length === room.players.length - 1) {
					endTurn(payload.roomId, "Everyone guessed it!");
				}
				return;
			}
		}

		// Standard chat message
		io.to(payload.roomId).emit("receive_message", {
			username,
			text: payload.text,
		});
	});

	socket.on("word_chosen", ({ roomId, word }) => {
		const room = rooms[roomId];
		if (
			!room ||
			room.status !== "CHOOSING" ||
			room.currentTurn.drawerId !== socket.id
		)
			return;

		if (room.timerInterval) clearInterval(room.timerInterval);
		startDrawingPhase(roomId, word);
	});

	function startRound(roomId) {
		const room = rooms[roomId];
		if (!room) return;

		if (room.round > room.settings.maxRounds) {
			// Sort players into a podium based on final scores
			const podium = [...room.players]
				.map((p) => ({
					id: p.id,
					username: p.username,
					score: room.scores[p.id] || 0,
				}))
				.sort((a, b) => b.score - a.score);

			io.to(roomId).emit("game_over", {
				podium: podium,
				scores: room.scores,
			});
			room.status = "LOBBY";
			return;
		}

		room.turnIndex = 0;
		io.to(roomId).emit("round_start", {
			round: room.round,
			maxRounds: room.settings.maxRounds,
		});

		setTimeout(() => startTurn(roomId), 3000);
	}

	function startTurn(roomId) {
		const room = rooms[roomId];
		if (!room) return;

		if (room.turnIndex >= room.players.length) return endRound(roomId);

		room.status = "CHOOSING";
		const currentDrawer = room.players[room.turnIndex];

		// --- NEW: Reset the Turn State securely! ---
		// --- NEW: Reset the Turn State securely! ---
		room.currentTurn = {
			drawerId: currentDrawer.id,
			word: "",
			correctGuessers: [],
			timeLeft: 15,
			turnScores: {}, // Tracks points earned specifically in this turn
			firstGuessTimeLeft: null, // Tracks how fast the first person guessed
		};

		io.to(roomId).emit("turn_start", {
			drawerId: room.currentTurn.drawerId,
			drawerName: currentDrawer.username,
		});

		const availableWords = WORD_LIST.filter(
			(w) => !room.usedWords.includes(w),
		);
		let poolOfWords = availableWords
			.sort(() => 0.5 - Math.random())
			.slice(0, room.settings.wordCount);

		if (poolOfWords.length < room.settings.wordCount) {
			poolOfWords = WORD_LIST.sort(() => 0.5 - Math.random()).slice(
				0,
				room.settings.wordCount,
			);
		}

		io.to(room.currentTurn.drawerId).emit("word_options", poolOfWords);

		room.timerInterval = setInterval(() => {
			room.currentTurn.timeLeft--;
			io.to(roomId).emit("timer_update", {
				phase: "choosing",
				time: room.currentTurn.timeLeft,
			});

			if (room.currentTurn.timeLeft <= 0) {
				clearInterval(room.timerInterval);
				startDrawingPhase(roomId, poolOfWords[0]); // Auto-pick
			}
		}, 1000);
	}

	function startDrawingPhase(roomId, chosenWord) {
		const room = rooms[roomId];
		if (!room) return;

		room.status = "DRAWING";
		room.currentTurn.word = chosenWord;
		room.currentTurn.timeLeft = room.settings.drawTime; // Use host setting!
		room.usedWords.push(chosenWord);

		io.to(roomId).emit("game_started", {
			drawerId: room.currentTurn.drawerId,
			wordLength: chosenWord.length,
		});

		// 2. Tell ONLY THE DRAWER what the actual word is
		io.to(room.currentTurn.drawerId).emit("your_word", {
			word: chosenWord,
		});

		io.to(roomId).emit("clear_canvas");

		room.timerInterval = setInterval(() => {
			room.currentTurn.timeLeft--;
			io.to(roomId).emit("timer_update", {
				phase: "drawing",
				time: room.currentTurn.timeLeft,
			});

			if (room.currentTurn.timeLeft <= 0) {
				clearInterval(room.timerInterval);
				endTurn(roomId, "Time's up!");
			}
		}, 1000);
	}

	function endTurn(roomId, reason) {
		const room = rooms[roomId];
		if (!room) return;

		room.status = "TURN_END";
		if (room.timerInterval) clearInterval(room.timerInterval);

		const turn = room.currentTurn;

		// --- CALCULATE DRAWER POINTS ---
		// Drawer only gets points if at least one person guessed correctly
		if (turn.correctGuessers.length > 0 && turn.drawerId) {
			let baseDrawerPoints = turn.correctGuessers.length * 20;
			// Bonus based on how fast the FIRST person guessed it
			let speedBonus = Math.floor(
				(turn.firstGuessTimeLeft / room.settings.drawTime) * 50,
			);

			let totalDrawerPoints = baseDrawerPoints + speedBonus;

			turn.turnScores[turn.drawerId] = totalDrawerPoints;
			room.scores[turn.drawerId] =
				(room.scores[turn.drawerId] || 0) + totalDrawerPoints;
		}

		io.to(roomId).emit("turn_end", {
			reason: reason,
			word: turn.word,
			scores: room.scores, // The total scores (for the left sidebar)
			turnScores: turn.turnScores, // The points earned THIS round (for the popup)
		});

		// Advance to next person
		room.turnIndex++;
		setTimeout(() => startTurn(roomId), 5000);
	}

	function endRound(roomId) {
		const room = rooms[roomId];
		if (!room) return;

		room.status = "ROUND_END";
		io.to(roomId).emit("round_finish", {
			round: room.round,
			scores: room.scores,
		});

		room.round++;
		setTimeout(() => startRound(roomId), 7000);
	}

	socket.on("disconnect", () => {
		for (const roomId in rooms) {
			const room = rooms[roomId];
			const playerIndex = room.players.findIndex(
				(p) => p.id === socket.id,
			);

			if (playerIndex !== -1) {
				const playerWhoLeft = room.players[playerIndex];
				room.players.splice(playerIndex, 1);

				if (room.players.length === 0) {
					if (room.timerInterval) clearInterval(room.timerInterval);
					delete rooms[roomId];
				} else {
					// Update host privileges if host left
					if (playerIndex === 0) {
						io.to(roomId).emit("receive_message", {
							username: "System",
							text: `${room.players[0].username} is the new host.`,
							isSystemMsg: true,
						});
					}

					io.to(roomId).emit("player_left", {
						playerArr: room.players,
					});
					io.to(roomId).emit("receive_message", {
						username: "System",
						text: `${playerWhoLeft.username} has disconnected.`,
						isSystemMsg: true,
					});

					// If the drawer quit mid-turn, kill the turn immediately
					if (
						room.currentTurn.drawerId === socket.id &&
						room.status === "DRAWING"
					) {
						endTurn(roomId, "The drawer left!");
					}
				}
				break;
			}
		}
	});
});

httpserver.listen(5000, () => {
	console.log("Server is listening on port 5000");
});
