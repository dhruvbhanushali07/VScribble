import React, { useContext, useEffect, useState, useRef } from "react";
import Canvas from "./Canvas";
import Chat from "./Chat";
import { SocketContext } from "../context/SocketContext";
import { useLocation, useParams } from "react-router";
import gsap from "gsap";

interface Player {
    id: string;
    username: string;
}

interface PodiumPlayer {
    id: string;
    username: string;
    score: number;
}

// ==========================================
// 1. GAME SETTINGS COMPONENT (LOBBY UI)
// ==========================================
const GameSettings = ({
    isOwner, roomId, socket, startGame, allPlayerLength
}: {
    isOwner: boolean; roomId: string; socket: any; startGame: () => void; allPlayerLength: number;
}) => {
    const [settings, setSettings] = useState({
        maxPlayers: 8,
        drawTime: 90,
        maxRounds: 3,
        wordCount: 3,
        hints: 2
    });

    useEffect(() => {
        if (isOwner) socket?.emit("update_settings", { roomId, ...settings });
    }, [settings, isOwner, roomId, socket]);

    useEffect(() => {
        if (!socket || isOwner) return;
        socket.on("settings_updated", (newSettings: any) => setSettings(newSettings));
        return () => socket.off("settings_updated");
    }, [socket, isOwner]);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSettings(prev => ({ ...prev, [e.target.name]: Number(e.target.value) }));
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-white rounded-xl shadow-inner p-8">
            <h2 className="text-4xl font-black text-gray-800 mb-2">Lobby</h2>
            <p className="text-gray-500 mb-6">Waiting for players to join...</p>

            <div className="bg-gray-50 border-2 border-gray-100 rounded-2xl p-6 w-full max-w-lg grid grid-cols-2 gap-4">
                {[
                    { label: "Max Players", name: "maxPlayers", options: [2, 3, 4, 5, 6, 7, 8] },
                    { label: "Rounds", name: "maxRounds", options: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
                    { label: "Draw Time (s)", name: "drawTime", options: [30, 45, 60, 80, 90, 100, 120] },
                    { label: "Word Options", name: "wordCount", options: [2, 3, 4, 5] },
                    { label: "Hints", name: "hints", options: [0, 1, 2, 3] },
                ].map((field) => (
                    <div key={field.name} className="flex flex-col">
                        <label className="font-bold text-gray-700 uppercase text-xs mb-1">{field.label}</label>
                        <select
                            name={field.name}
                            value={(settings as any)[field.name]}
                            onChange={handleChange}
                            disabled={!isOwner}
                            className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg p-2 font-bold disabled:bg-gray-100"
                        >
                            {field.options.map(num => <option key={num} value={num}>{num}</option>)}
                        </select>
                    </div>
                ))}
            </div>

            <div className="mt-8 flex flex-col items-center">
                {isOwner ? (
                    <button
                        onClick={startGame}
                        disabled={allPlayerLength < 2}
                        className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-black text-xl py-4 px-12 rounded-xl shadow-lg transition-transform active:scale-95"
                    >
                        {allPlayerLength < 2 ? "Need More Players" : "Start Game"}
                    </button>
                ) : (
                    <div className="text-lg font-bold text-blue-600 animate-pulse">Waiting for host to start...</div>
                )}
            </div>
        </div>
    );
};

// ==========================================
// 2. MAIN ROOM COMPONENT
// ==========================================
export default function Room() {
    const socket = useContext(SocketContext);
    const location = useLocation();
    const { roomId } = useParams<{ roomId: string }>();

    const [allPlayer, setAllPlayers] = useState<Player[]>(location.state?.players || location.state?.playerArr || []);
    
    // --- STATE MACHINE & UX ---
    const [gamePhase, setGamePhase] = useState<"LOBBY" | "ROUND_START" | "CHOOSING" | "DRAWING" | "TURN_END" | "GAME_OVER">("LOBBY");
    const [isLeftHanded, setIsLeftHanded] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);
    
    // --- GAME DATA ---
    const [currentDrawerId, setCurrentDrawerId] = useState<string | null>(null);
    const [currentDrawerName, setCurrentDrawerName] = useState<string>("");
    const [currentWord, setCurrentWord] = useState<string>(""); 
    const [wordLength, setWordLength] = useState<number>(0);    
    const [wordOptions, setWordOptions] = useState<string[]>([]);
    const [hintArray, setHintArray] = useState<string[]>([]); // Tracks live hints
    
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [turnScores, setTurnScores] = useState<Record<string, number>>({}); 
    const [podium, setPodium] = useState<PodiumPlayer[]>([]);
    
    const [roundData, setRoundData] = useState({ current: 1, max: 3 });
    const [turnEndData, setTurnEndData] = useState({ reason: "", word: "" });

    const isOwner = allPlayer.length > 0 && allPlayer[0].id === socket?.id;
    const isDrawer = currentDrawerId === socket?.id;

    // --- GSAP ANIMATION REFS ---
    const overlayRef = useRef<HTMLDivElement>(null);

    // Copy to clipboard helper
    const copyRoomCode = () => {
        if (roomId) {
            navigator.clipboard.writeText(roomId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    useEffect(() => {
        if (overlayRef.current && gamePhase !== "LOBBY" && gamePhase !== "DRAWING") {
            gsap.fromTo(overlayRef.current, 
                { y: 50, opacity: 0, scale: 0.9 }, 
                { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.5)" }
            );
        }
    }, [gamePhase]);

    useEffect(() => {
        if (!socket) return;

        socket.on("player_joined", (payload) => setAllPlayers(payload.playerArr));
        socket.on("player_left", (payload) => setAllPlayers(payload.playerArr));

        socket.on("round_start", (payload) => {
            setRoundData({ current: payload.round, max: payload.maxRounds });
            setGamePhase("ROUND_START");
            setScores(prev => Object.keys(prev).length === 0 ? {} : prev); 
        });

        socket.on("turn_start", (payload) => {
            setCurrentDrawerId(payload.drawerId);
            setCurrentDrawerName(payload.drawerName);
            setTurnScores({}); 
            setHintArray([]);
            setGamePhase("CHOOSING");
        });

        socket.on("word_options", (words: string[]) => setWordOptions(words));

        socket.on("game_started", (payload) => {
            setGamePhase("DRAWING");
            setCurrentDrawerId(payload.drawerId);
            setWordLength(payload.wordLength);
            setHintArray(payload.initialHint || []); // Set initial blanks
            setCurrentWord(""); 
        });

        socket.on("your_word", (payload) => setCurrentWord(payload.word));

        // Listen for smart hint updates
        socket.on("word_hint", (payload) => setHintArray(payload.hintString));

        socket.on("timer_update", (payload) => setTimeLeft(payload.time));

        socket.on("turn_end", (payload) => {
            setTurnEndData({ reason: payload.reason, word: payload.word });
            setScores(payload.scores);
            setTurnScores(payload.turnScores || {});
            setGamePhase("TURN_END");
        });

        socket.on("game_over", (payload) => {
            setScores(payload.scores);
            setPodium(payload.podium || []);
            setGamePhase("GAME_OVER");
            setCurrentDrawerId(null);
            setCurrentWord("");
            
            setTimeout(() => {
                setGamePhase("LOBBY");
            }, 10000);
        });

        return () => {
            socket.off("player_joined"); socket.off("player_left");
            socket.off("round_start"); socket.off("turn_start");
            socket.off("word_options"); socket.off("game_started");
            socket.off("your_word"); socket.off("word_hint");
            socket.off("timer_update"); socket.off("turn_end"); 
            socket.off("game_over");
        };
    }, [socket]);

    const handleChooseWord = (word: string) => {
        socket?.emit("word_chosen", { roomId, word });
    };

    return (
        <div className="flex flex-col w-full h-screen bg-gray-100 overflow-hidden">
            {/* Top Navigation */}
            <div className="flex justify-between items-center bg-white shadow-sm p-4 border-b-2 z-20">
                <div className="flex flex-col w-1/3">
                    <h1 className="font-extrabold text-xl flex items-center gap-2">
                        Room: <span className="text-blue-600 tracking-widest">{roomId}</span>
                        <button 
                            onClick={copyRoomCode} 
                            className="p-1 rounded hover:bg-gray-200 transition-colors cursor-pointer"
                            title="Copy Room Code"
                        >
                            {copied ? "✅" : "📋"}
                        </button>
                    </h1>
                    <span className="text-sm text-gray-500 font-medium">
                        {gamePhase !== "LOBBY" ? `Round ${roundData.current} of ${roundData.max}` : "Waiting to start"}
                    </span>
                </div>

                {/* Center Word Display */}
                <div className="w-1/3 flex justify-center">
                    {gamePhase === "DRAWING" && (
                        <div className="text-2xl font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                            {isDrawer ? (
                                <span className="text-green-600 tracking-[0.2em]">{currentWord}</span>
                            ) : (
                                <div className="flex items-start gap-1">
                                    <span className="tracking-[0.3em]">
                                        {/* Render Hints Dynamically */}
                                        {hintArray.map((char, index) => (
                                            <span 
                                                key={index} 
                                                className={char !== "_" ? "text-blue-600 font-black" : "text-gray-800"}
                                            >
                                                {char} 
                                            </span>
                                        ))}
                                    </span>
                                    <sup className="text-sm text-gray-400 font-bold mt-1">{wordLength}</sup>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Controls (Timer + Layout Swap) */}
                <div className="flex items-center gap-6 w-1/3 justify-end">
                    <button 
                        onClick={() => setIsLeftHanded(!isLeftHanded)}
                        className="text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full border border-gray-300 transition-colors shadow-sm"
                        title="Swap UI for Left-Handed Drawing"
                    >
                        Swap Layout 🖐️
                    </button>
                    
                    {timeLeft !== null && gamePhase !== "LOBBY" && gamePhase !== "GAME_OVER" && (
                        <div className={`text-2xl font-bold w-16 text-right ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-gray-800'}`}>
                            ⏱ {timeLeft}s
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Area - Flex direction conditionally swapped! */}
            <div className={`flex w-full h-[calc(100vh-80px)] p-4 gap-4 relative ${isLeftHanded ? 'flex-row-reverse' : 'flex-row'}`}>
                
                {/* Sidebar: Players & Chat */}
                <div className="w-1/4 flex flex-col gap-4 z-20">
                    <div className="bg-white p-4 rounded-xl shadow-sm border h-1/3 overflow-y-auto">
                        <h2 className="font-bold text-gray-700 border-b pb-2 mb-2">Players</h2>
                        <div className="flex flex-col gap-1">
                            {[...allPlayer].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0)).map((player) => (
                                <div key={player.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${player.id === socket?.id ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
                                        <p className={`font-semibold ${player.id === socket?.id ? 'text-blue-600' : 'text-gray-700'} truncate max-w-[100px]`}>
                                            {player.username} {player.id === currentDrawerId && "✏️"}
                                        </p>
                                    </div>
                                    <span className="font-bold text-indigo-600">{scores[player.id] || 0} pts</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border h-2/3 overflow-hidden">
                        <Chat />
                    </div>
                </div>

                {/* Dynamic View Area */}
                <div className="w-3/4 relative rounded-xl overflow-hidden shadow-md bg-white border-2">
                    
                    {/* OVERLAYS */}
                    {gamePhase !== "DRAWING" && (
                        <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                            
                            {/* 1. LOBBY */}
                            {gamePhase === "LOBBY" && (
                                <GameSettings isOwner={isOwner} roomId={roomId!} socket={socket} startGame={() => socket?.emit("start_game", roomId)} allPlayerLength={allPlayer.length} />
                            )}

                            {/* 2. ROUND START */}
                            {gamePhase === "ROUND_START" && (
                                <div ref={overlayRef} className="bg-white p-12 rounded-3xl shadow-2xl text-center transform">
                                    <h2 className="text-6xl font-black text-indigo-600 mb-4">Round {roundData.current}</h2>
                                    <p className="text-xl text-gray-500 font-bold">Get ready!</p>
                                </div>
                            )}

                            {/* 3. CHOOSING WORD */}
                            {gamePhase === "CHOOSING" && (
                                <div ref={overlayRef} className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-lg w-full">
                                    {isDrawer ? (
                                        <>
                                            <h2 className="text-3xl font-black text-gray-800 mb-6">Choose a word</h2>
                                            <div className="flex gap-4 justify-center">
                                                {wordOptions.map(word => (
                                                    <button 
                                                        key={word} 
                                                        onClick={() => handleChooseWord(word)}
                                                        className="px-6 py-3 bg-indigo-100 hover:bg-indigo-600 hover:text-white text-indigo-800 font-bold rounded-xl transition-colors text-lg"
                                                    >
                                                        {word}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-6xl mb-4">🤔</div>
                                            <h2 className="text-3xl font-black text-gray-800">
                                                <span className="text-blue-600">{currentDrawerName}</span> is choosing a word...
                                            </h2>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* 4. TURN END / SCORECARD */}
                            {gamePhase === "TURN_END" && (
                                <div ref={overlayRef} className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-md w-full">
                                    <h2 className="text-2xl font-bold text-gray-500 mb-2">{turnEndData.reason}</h2>
                                    <h3 className="text-4xl font-black text-green-600 tracking-widest mb-8">
                                        {turnEndData.word}
                                    </h3>
                                    
                                    <div className="space-y-2 text-left bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <h4 className="font-bold text-gray-800 border-b pb-2 mb-2">Scores</h4>
                                        {[...allPlayer].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0)).map((p, i) => (
                                            <div key={p.id} className="flex justify-between font-semibold text-lg items-center">
                                                <span className="text-gray-700">#{i + 1} {p.username}</span>
                                                <div>
                                                    <span className="text-indigo-600">{scores[p.id] || 0}</span>
                                                    {/* Explicit +0 Logic added here */}
                                                    {turnScores[p.id] !== undefined && (
                                                        <span className={`text-sm ml-2 font-black ${turnScores[p.id] > 0 ? 'text-green-500' : 'text-gray-400'}`}>
                                                            (+{turnScores[p.id]})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 5. GAME OVER (PODIUM) */}
                            {gamePhase === "GAME_OVER" && (
                                <div ref={overlayRef} className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-2xl w-full">
                                    <h2 className="text-5xl font-black text-gray-800 mb-10">🏆 Final Podium 🏆</h2>
                                    
                                    <div className="flex justify-center items-end gap-6 mb-10 h-48">
                                        {podium[1] && (
                                            <div className="flex flex-col items-center animate-bounce delay-100">
                                                <span className="text-xl font-bold text-gray-600 truncate max-w-[120px]">{podium[1].username}</span>
                                                <span className="text-lg font-black text-gray-500">{podium[1].score} pts</span>
                                                <div className="w-24 h-24 bg-gray-300 rounded-t-lg flex items-center justify-center text-3xl font-black text-white shadow-inner">2</div>
                                            </div>
                                        )}
                                        
                                        {podium[0] && (
                                            <div className="flex flex-col items-center animate-bounce z-10">
                                                <span className="text-2xl font-black text-yellow-500 truncate max-w-[140px]">👑 {podium[0].username}</span>
                                                <span className="text-xl font-black text-yellow-600">{podium[0].score} pts</span>
                                                <div className="w-32 h-32 bg-yellow-400 rounded-t-lg flex items-center justify-center text-5xl font-black text-white shadow-inner">1</div>
                                            </div>
                                        )}

                                        {podium[2] && (
                                            <div className="flex flex-col items-center animate-bounce delay-200">
                                                <span className="text-xl font-bold text-orange-700 truncate max-w-[120px]">{podium[2].username}</span>
                                                <span className="text-lg font-black text-orange-600">{podium[2].score} pts</span>
                                                <div className="w-24 h-16 bg-orange-300 rounded-t-lg flex items-center justify-center text-3xl font-black text-white shadow-inner">3</div>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-gray-400 font-medium animate-pulse">Returning to Lobby...</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SECURITY OVERLAY (For guessers during drawing) */}
                    {gamePhase === "DRAWING" && !isDrawer && (
                        <div className="absolute inset-0 z-20 cursor-not-allowed"></div>
                    )}
                    
                    {/* THE CANVAS */}
                    <div className="w-full h-full relative z-10">
                        <Canvas />
                    </div>
                </div>
            </div>
        </div>
    );
}