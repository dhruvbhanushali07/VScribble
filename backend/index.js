import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const httpserver = http.createServer(app);

// Grab the env variable, but also provide your exact Vercel URL as a fallback
const FRONTEND_URL = process.env.FRONTEND_URL || "https://v-scribble.vercel.app";

const io = new Server(httpserver, {
    cors: {
        // We put all valid URLs in an array so it accepts local testing AND production
        origin: [
            FRONTEND_URL, 
            "https://v-scribble.vercel.app", 
            "http://localhost:5173"
        ],
        methods: ["GET", "POST"],
        credentials: true
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
];

const rooms = {};

// --- HELPER: Levenshtein Distance ---
function getLevenshteinDistance(a, b) {
	const matrix = Array.from({ length: a.length + 1 }, () =>
		Array(b.length + 1).fill(0),
	);
	for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
	for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1, // deletion
				matrix[i][j - 1] + 1, // insertion
				matrix[i - 1][j - 1] + cost, // substitution
			);
		}
	}
	return matrix[a.length][b.length];
}

// --- HELPER: Smart Hint Generator ---
function generateSmartHint(turn) {
	const word = turn.word;
	const indices = [];

	// Find indices that are still blank
	for (let i = 0; i < word.length; i++) {
		if (turn.hintString[i] === "_") indices.push(i);
	}

	// Never reveal the whole word
	if (indices.length <= 1) return;

	let revealIndex;

	if (turn.hintsGiven === 0) {
		// Smart Hint 1: Always reveal the first letter
		revealIndex = 0;
	} else if (turn.hintsGiven === 1) {
		// Smart Hint 2: Try to reveal a vowel
		const vowels = ["A", "E", "I", "O", "U"];
		const vowelIndices = indices.filter((i) => vowels.includes(word[i]));
		if (vowelIndices.length > 0) {
			revealIndex =
				vowelIndices[Math.floor(Math.random() * vowelIndices.length)];
		} else {
			revealIndex = indices[Math.floor(Math.random() * indices.length)];
		}
	} else {
		// Future Hints: Random unrevealed letter
		revealIndex = indices[Math.floor(Math.random() * indices.length)];
	}

	turn.hintString[revealIndex] = word[revealIndex];
	turn.hintsGiven++;
}

io.on("connection", (socket) => {
	console.log("New socket connected: ", socket.id);

	socket.on("req_create_room", (username) => {
		let roomId;
		do {
			roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
		} while (rooms[roomId]);

		const roomOwner = { id: socket.id, username: username };

		rooms[roomId] = {
			players: [roomOwner],
			status: "LOBBY",
			round: 1,
			usedWords: [],
			scores: {},
			timerInterval: null,
			settings: {
				maxPlayers: 8,
				drawTime: 90,
				maxRounds: 3,
				wordCount: 3,
				hints: 2,
			},
			// Add this inside BOTH req_create_room AND startTurn where currentTurn is defined:
			currentTurn: {
				drawerId: null,
				word: "",
				correctGuessers: [],
				timeLeft: 0,
				hintString: [],
				hintTimes: [],
				hintsGiven: 0,
				canvasHistory: [], 
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
        if (!room) return socket.emit("room_error", "This room does not exist.");
        if (room.players.length >= room.settings.maxPlayers) return socket.emit("room_error", "This room is full.");
        
        // WE REMOVED THE "LOBBY ONLY" CHECK HERE SO LATE JOINERS CAN ENTER!

        let player = { id: socket.id, username: username };
        room.players.push(player);
        socket.join(roomId);

        socket.emit("join_success", { roomId, playerArr: room.players });
        socket.to(roomId).emit("player_joined", { playerArr: room.players });

        io.to(roomId).emit("receive_message", {
            username: "System", text: `${username} has joined the room.`, isSystemMsg: true,
        });

        // --- NEW: LATE JOINER SYNC ---
        // If they joined mid-round, bring their game state up to speed!
        if (room.status === "DRAWING") {
            // 1. Tell them the game is active, who is drawing, and give them the current hints
            socket.emit("game_started", {
                drawerId: room.currentTurn.drawerId,
                wordLength: room.currentTurn.word.length,
                initialHint: room.currentTurn.hintString
            });
            // 2. Send them all the lines drawn so far
            socket.emit("canvas_history", room.currentTurn.canvasHistory);
        }
    });

	socket.on("update_settings", (payload) => {
		const room = rooms[payload.roomId];
		if (!room || room.players[0].id !== socket.id) return;

		room.settings = { ...room.settings, ...payload };
		socket.to(payload.roomId).emit("settings_updated", room.settings);
	});

	socket.on("start_game", (roomId) => {
		const room = rooms[roomId];
		if (
			!room ||
			room.players.length < 2 ||
			room.status !== "LOBBY" ||
			room.players[0].id !== socket.id
		)
			return;

		room.scores = {};
		room.players.forEach((p) => (room.scores[p.id] = 0));
		room.round = 1;
		room.usedWords = [];

		startRound(roomId);
	});

	socket.on("draw_event", (payload) => {
        const room = rooms[payload.roomId];
        if (!room) return;

        // SECURITY PATCH: Reject drawing if it's not this socket's turn
        if (room.currentTurn.drawerId !== socket.id) return;

        // Save the stroke to history!
        room.currentTurn.canvasHistory.push(payload);

        socket.to(payload.roomId).emit("draw_event", payload);
    });

    socket.on("clear_canvas", (roomId) => {
        const room = rooms[roomId];
        if (!room || room.currentTurn.drawerId !== socket.id) return;
        
        // Wipe the history!
        room.currentTurn.canvasHistory = [];
        
        socket.to(roomId).emit("clear_canvas");
    });

	// ==========================================
	// CHAT & GUESS SYSTEM (Updated with Close Guesses)
	// ==========================================
	socket.on("chat_message", (payload) => {
		const room = rooms[payload.roomId];
		if (!room) return;

		const player = room.players.find((p) => p.id === socket.id);
		const username = player ? player.username : "Unknown";
		const guessedWord = payload.text.trim().toUpperCase();
		const turn = room.currentTurn;

		if (room.status === "DRAWING" && turn.word) {
			// Block drawer or already correct guessers from answering
			if (
				socket.id === turn.drawerId ||
				turn.correctGuessers.includes(socket.id)
			) {
				if (guessedWord === turn.word) return;
			}

			// Correct Guess Logic
			if (guessedWord === turn.word) {
				turn.correctGuessers.push(socket.id);

				if (turn.correctGuessers.length === 1)
					turn.firstGuessTimeLeft = turn.timeLeft;

				const rank = turn.correctGuessers.length;
				let points = Math.max(10, 100 - (rank - 1) * 20);

				turn.turnScores[socket.id] = points;
				room.scores[socket.id] += points;

				io.to(payload.roomId).emit("receive_message", {
					username: username,
					text: "",
					isCorrectGuess: true,
				});

				if (turn.correctGuessers.length === room.players.length - 1) {
					endTurn(payload.roomId, "Everyone guessed it!");
				}
				return;
			}

			// Close Guess Logic (Levenshtein)
			const dist = getLevenshteinDistance(guessedWord, turn.word);
			// Allow 1 typo for short words (<=5), 2 typos for long words
			const isClose =
				(turn.word.length <= 5 && dist === 1) ||
				(turn.word.length > 5 && dist <= 2);

			if (isClose) {
				// Whisper to the user ONLY. Do not broadcast.
				io.to(socket.id).emit("receive_message", {
					username: "System",
					text: `'${payload.text}' is close!`,
					isSystemMsg: true,
				});
				return; // Stop here so it doesn't show in public chat
			}
		}

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

		room.currentTurn = {
			drawerId: currentDrawer.id,
			word: "",
			correctGuessers: [],
			timeLeft: 15,
			turnScores: {},
			firstGuessTimeLeft: null,
			// Setup hint states
			hintString: [],
			hintTimes: [],
			hintsGiven: 0,
			canvasHistory: []
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
				startDrawingPhase(roomId, poolOfWords[0]);
			}
		}, 1000);
	}

	function startDrawingPhase(roomId, chosenWord) {
		const room = rooms[roomId];
		if (!room) return;

		room.status = "DRAWING";
		room.currentTurn.word = chosenWord;
		room.currentTurn.timeLeft = room.settings.drawTime;
		room.usedWords.push(chosenWord);

		// Prep hint pacing
		room.currentTurn.hintString = Array(chosenWord.length).fill("_");

		// Calculate the specific seconds when hints should fire
		const totalHints = Math.min(room.settings.hints, chosenWord.length - 2); // Ensure we don't reveal too much
		for (let i = 1; i <= totalHints; i++) {
			// Evenly space out hints: e.g., if 90s and 2 hints -> hints at 60s and 30s
			room.currentTurn.hintTimes.push(
				Math.floor(room.settings.drawTime * (1 - i / (totalHints + 1))),
			);
		}

		io.to(roomId).emit("game_started", {
			drawerId: room.currentTurn.drawerId,
			wordLength: chosenWord.length,
			initialHint: room.currentTurn.hintString, // Send empty blanks
		});

		io.to(room.currentTurn.drawerId).emit("your_word", {
			word: chosenWord,
		});
		io.to(roomId).emit("clear_canvas");

		room.timerInterval = setInterval(() => {
			room.currentTurn.timeLeft--;
			const turn = room.currentTurn;

			// CHECK IF HINT SHOULD FIRE THIS SECOND
			if (turn.hintTimes.includes(turn.timeLeft)) {
				generateSmartHint(turn);
				// Send updated hint string to frontend
				io.to(roomId).emit("word_hint", {
					hintString: turn.hintString,
				});
			}

			io.to(roomId).emit("timer_update", {
				phase: "drawing",
				time: turn.timeLeft,
			});

			if (turn.timeLeft <= 0) {
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

		if (turn.correctGuessers.length > 0 && turn.drawerId) {
			let baseDrawerPoints = turn.correctGuessers.length * 20;
			let speedBonus = Math.floor(
				(turn.firstGuessTimeLeft / room.settings.drawTime) * 50,
			);
			let totalDrawerPoints = baseDrawerPoints + speedBonus;
			turn.turnScores[turn.drawerId] = totalDrawerPoints;
			room.scores[turn.drawerId] =
				(room.scores[turn.drawerId] || 0) + totalDrawerPoints;
		}

		// --- NEW: Explicitly assign 0 to players who didn't guess ---
		room.players.forEach((p) => {
			if (turn.turnScores[p.id] === undefined) {
				turn.turnScores[p.id] = 0;
			}
		});

		io.to(roomId).emit("turn_end", {
			reason: reason,
			word: turn.word,
			scores: room.scores,
			turnScores: turn.turnScores,
		});

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
        console.log("Socket disconnected:", socket.id);

        // 1. Search all active rooms to find where this socket belonged
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex((p) => p.id === socket.id);

            // If the player is found in this room
            if (playerIndex !== -1) {
                const playerWhoLeft = room.players[playerIndex];

                // 2. Remove them from the room's player array
                room.players.splice(playerIndex, 1);

                // 3. Handle Empty Room
                if (room.players.length === 0) {
                    // Stop the timer to prevent memory leaks!
                    if (room.timerInterval) clearInterval(room.timerInterval);
                    // Delete the room from server memory
                    delete rooms[roomId];
                    console.log(`Room ${roomId} deleted (empty).`);
                } 
                // 4. Handle Remaining Players
                else {
                    // Update the UI for everyone else
                    io.to(roomId).emit("player_left", { playerArr: room.players });
                    io.to(roomId).emit("receive_message", {
                        username: "System",
                        text: `${playerWhoLeft.username} has disconnected.`,
                        isSystemMsg: true,
                    });

                    // 5. Host Migration
                    // If the person who left was index 0 (the host), the array shifted up.
                    // The new index 0 is automatically the new host.
                    if (playerIndex === 0) {
                        io.to(roomId).emit("receive_message", {
                            username: "System",
                            text: `${room.players[0].username} is the new host.`,
                            isSystemMsg: true,
                        });
                    }

                    // 6. Game State Rescue (Drawer Rage-Quit)
                    // If the game is active and the person who left was the one drawing (or choosing)
                    if (
                        (room.status === "DRAWING" || room.status === "CHOOSING") && 
                        room.currentTurn.drawerId === socket.id
                    ) {
                        // Kill the turn immediately so the room doesn't wait 90 seconds in silence
                        endTurn(roomId, "The drawer left!");
                    }
                    
                    // Optional Game State Rescue (Not enough players)
                    // If a game is running but now only 1 person is left, end the game.
                    if (room.status !== "LOBBY" && room.players.length < 2) {
                        if (room.timerInterval) clearInterval(room.timerInterval);
                        room.status = "LOBBY";
                        io.to(roomId).emit("receive_message", {
                            username: "System",
                            text: "Not enough players to continue. Game ended.",
                            isSystemMsg: true,
                        });
                        io.to(roomId).emit("game_over", { 
                            podium: [], // Nobody wins if everyone leaves
                            scores: room.scores 
                        });
                    }
                }
                
                // Break the loop since a socket can only be in one game room
                break; 
            }
        }
    });
});

const PORT = process.env.PORT || 5000;
httpserver.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));