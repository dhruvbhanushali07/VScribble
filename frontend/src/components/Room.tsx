import { useContext, useEffect, useState } from "react";
import Canvas from "./Canvas";
import Chat from "./Chat";
import { SocketContext } from "../context/SocketContext";
import { useLocation, useParams } from "react-router";

interface Player {
    id: string;
    username: string;
}

export default function Room() {
    const socket = useContext(SocketContext);
    const location = useLocation();
    
    // 1. Extract Room ID from the URL so players can share it
    const { roomId } = useParams<{ roomId: string }>();

    const [allPlayer, setAllPlayers] = useState<Player[]>(
        location.state?.players || location.state?.playerArr || [] // Fallback handles both namings safely
    );

    // --- GAME LOOP STATE ---
    const [isDrawer, setIsDrawer] = useState<boolean>(false);
    const [currentWord, setCurrentWord] = useState<string>("");
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [gameStatus, setGameStatus] = useState<string>("Waiting for players...");

    // The owner is the first person who created the room
    const isOwner = allPlayer.length > 0 && allPlayer[0].id === socket?.id;

    useEffect(() => {
        if (!socket) return;

        // --- PLAYER MANAGEMENT ---
        const handlePlayerJoined = (payload: { playerArr: Player[] }) => {
            setAllPlayers(payload.playerArr);
        };

        const handlePlayerLeft = (payload: { playerArr: Player[] }) => {
            setAllPlayers(payload.playerArr);
        };

        // --- GAME LOOP LOGIC ---
        const handleGameStarted = (payload: { drawerId: string; word?: string }) => {
            setGameStatus("Game in progress!");
            
            // Are YOU the drawer?
            if (payload.drawerId === socket.id) {
                setIsDrawer(true);
                setCurrentWord(`Your word is: ${payload.word}`);
            } else {
                setIsDrawer(false);
                setCurrentWord("Guess the word!");
            }
        };

        const handleTimerUpdate = (time: number) => {
            setTimeLeft(time);
        };

        const handleRoundEnded = (payload: { reason: string, word: string }) => {
            setGameStatus(`Round Over! The word was: ${payload.word}.`);
            setIsDrawer(false);
            setCurrentWord("");
            setTimeLeft(null);
        };

        // Attach listeners
        socket.on("player_joined", handlePlayerJoined);
        socket.on("player_left", handlePlayerLeft);
        socket.on("game_started", handleGameStarted);
        socket.on("timer_update", handleTimerUpdate);
        socket.on("round_ended", handleRoundEnded);

        return () => {
            // Clean up listeners
            socket.off("player_joined", handlePlayerJoined);
            socket.off("player_left", handlePlayerLeft);
            socket.off("game_started", handleGameStarted);
            socket.off("timer_update", handleTimerUpdate);
            socket.off("round_ended", handleRoundEnded);
        };
    }, [socket]);

    const startGame = () => {
        if (allPlayer.length < 2) {
            alert("You need at least 2 players to start the game!");
            return;
        }
        socket?.emit("start_game", roomId);
    };

    return (
        <div className="flex flex-col w-full h-screen bg-gray-50">
            
            {/* Top Navigation / Game Info Bar */}
            <div className="flex justify-between items-center bg-white shadow-sm p-4 border-b-2">
                <div className="flex flex-col">
                    <h1 className="font-extrabold text-xl">Room Code: <span className="text-blue-600 tracking-widest">{roomId}</span></h1>
                    <span className="text-sm text-gray-500">{gameStatus}</span>
                </div>

                {/* Word Display */}
                <div className="text-2xl font-black uppercase tracking-wider text-gray-800">
                    {currentWord}
                </div>

                {/* Timer & Controls */}
                <div className="flex items-center gap-4">
                    {timeLeft !== null && (
                        <div className={`text-2xl font-bold ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-gray-800'}`}>
                            ⏱ {timeLeft}s
                        </div>
                    )}
                    
                    {isOwner && !isDrawer && timeLeft === null && (
                        <button 
                            onClick={startGame}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow transition"
                        >
                            Start Game
                        </button>
                    )}
                </div>
            </div>

            {/* Main Game Area */}
            <div className="flex w-full h-[calc(100vh-80px)] p-4 gap-4">
                
                {/* Left Sidebar: Players & Chat */}
                <div className="w-1/4 flex flex-col gap-4">
                    {/* Players List */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border h-1/3 overflow-y-auto">
                        <h2 className="font-bold text-gray-700 border-b pb-2 mb-2">Players ({allPlayer.length}/8)</h2>
                        <div className="flex flex-col gap-1">
                            {allPlayer.length === 0 ? (
                                <p className="text-gray-400 italic">Waiting...</p>
                            ) : (
                                allPlayer.map((player) => (
                                    <div key={player.id} className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${player.id === socket?.id ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
                                        <p className={`font-medium ${player.id === socket?.id ? 'text-blue-600' : 'text-gray-700'}`}>
                                            {player.username} {player.id === allPlayer[0]?.id && "(Host)"}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Chat Component */}
                    <div className="bg-white rounded-xl shadow-sm border h-2/3 overflow-hidden">
                        <Chat />
                    </div>
                </div>

                {/* Right Area: Canvas */}
                <div className={`w-3/4 rounded-xl overflow-hidden shadow-md bg-white border-2 relative ${!isDrawer && timeLeft !== null ? 'pointer-events-none' : ''}`}>
                    {/* Security Overlay: If the game is running and you aren't the drawer, block mouse clicks */}
                    {!isDrawer && timeLeft !== null && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/5 ">
                        </div>
                    )}
                    
                    <Canvas />
                </div>
            </div>
        </div>
    );
}