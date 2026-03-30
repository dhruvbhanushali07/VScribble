import React, { useContext, useEffect, useState } from "react";
import { SocketContext } from "../context/SocketContext";
import { useNavigate } from "react-router";

export default function Lobby() {
    const [roomId, setRoomId] = useState<string>("");
    const [username, setUsername] = useState<string>("");
    const [error, setError] = useState<string | null>(null); // Added error state
    
    const socket = useContext(SocketContext);
    const navigate = useNavigate();

    function handleJoin(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        
        if (!username.trim()) {
            return setError("Please enter a username first.");
        }
        if (!roomId.trim()) {
            return setError("Please enter a Room Code.");
        }
        
        socket?.emit("join_room", roomId.trim().toUpperCase(), username.trim());
    } 

    function createRoom() {
        setError(null);
        
        if (!username.trim()) {
            return setError("Please enter a username first.");
        }
        
        socket?.emit("req_create_room", username.trim());
    }

    useEffect(() => {
        socket?.on("room_error", (err) => {
            setError(err); // Show the error to the user!
        });

        socket?.on("join_success", (payload) => {
            navigate(`/room/${payload.roomId}`, { state: { playerArr: payload.playerArr } });
        });

        socket?.on("res_create_room", (payload) => {
            navigate(`/room/${payload.roomId}`, { state: { playerArr: payload.playerArr } });
        });

        return () => {
            socket?.off("room_error");
            socket?.off("join_success");
            socket?.off("res_create_room");
        };
    }, [socket, navigate]); // FIXED: Added missing dependencies

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
            
            {/* Main Card */}
            <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden">
                
                {/* Header Area */}
                <div className="bg-gray-50 pt-8 pb-6 px-8 text-center border-b border-gray-100">
                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg transform rotate-3">
                        <span className="text-3xl">✏️</span>
                    </div>
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">VScribble</h1>
                    <p className="text-gray-500 mt-2 font-medium">Draw in the air, play anywhere.</p>
                </div>

                <div className="p-8 space-y-6">
                    
                    {/* Error Message Display */}
                    {error && (
                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-100 animate-pulse">
                            {error}
                        </div>
                    )}

                    {/* Global Username Input */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                            Your Name
                        </label>
                        <input 
                            type="text" 
                            className="w-full bg-gray-100 text-gray-800 font-semibold px-4 py-3 rounded-xl border-2 border-transparent focus:border-indigo-500 focus:bg-white focus:outline-none transition-all"
                            placeholder="e.g. Picasso" 
                            value={username} 
                            onChange={(e) => setUsername(e.currentTarget.value)} 
                            maxLength={15}
                        />
                    </div>

                    {/* Create Room Action */}
                    <button 
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg py-4 rounded-xl shadow-md transition-transform active:scale-95 disabled:opacity-50"
                        onClick={createRoom}
                        disabled={!username.trim()}
                    >
                        Create New Game
                    </button>

                    {/* Divider */}
                    <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-gray-200"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-400 font-bold text-sm">OR</span>
                        <div className="flex-grow border-t border-gray-200"></div>
                    </div>

                    {/* Join Room Form */}
                    <form onSubmit={handleJoin} className="space-y-3">
                        <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                            Join with Code
                        </label>
                        <div className="flex gap-2">
                            <input 
                                className="flex-grow bg-gray-100 text-gray-800 font-bold uppercase px-4 py-3 rounded-xl border-2 border-transparent focus:border-indigo-500 focus:bg-white focus:outline-none transition-all tracking-widest" 
                                type="text" 
                                placeholder="4-DIGIT CODE" 
                                value={roomId} 
                                onChange={(e) => setRoomId(e.currentTarget.value)} 
                                maxLength={6}
                            />
                            <button 
                                type="submit"
                                className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-6 py-3 rounded-xl transition-transform active:scale-95 disabled:opacity-50"
                                disabled={!username.trim() || !roomId.trim()}
                            >
                                Join
                            </button>
                        </div>
                    </form>

                </div>
            </div>
        </div>
    );
}