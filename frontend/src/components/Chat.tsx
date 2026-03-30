import React, { useContext, useState, useEffect, useRef } from "react";
import { SocketContext } from "../context/SocketContext";
import { useParams } from "react-router";

// MVP Integration: Updated interface to handle System/Guess messages
export interface ChatMessage {
    username: string; // Better to display names than socket IDs!
    text: string;
    isCorrectGuess?: boolean; 
    isSystemMsg?: boolean;
}

export default function Chat() {
    const socket = useContext(SocketContext);
    const { roomId } = useParams() as { roomId: string };

    const [chat, setChat] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState("");
    
    // Reference to auto-scroll chat to bottom
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll effect
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chat]);

    useEffect(() => {
        if (!socket) return;

        const handleReceiveMessage = (payload: ChatMessage) => {
            setChat((prev) => [...prev, payload]);
        };

        socket.on("receive_message", handleReceiveMessage);

        return () => {
            socket.off("receive_message", handleReceiveMessage);
        };
    }, [socket]); // FIXED: Dependency array prevents infinite listener loops

    function sendMessage(e: React.FormEvent) {
        e.preventDefault();
        if (!inputText.trim()) return;

        // The backend already knows who you are based on your socket.id, 
        // so we just need to send the room and the text!
        socket?.emit("chat_message", { roomId, text: inputText });
        
        // Clear the input after sending
        setInputText("");
    }

    return (
        <div className="flex flex-col h-full relative bg-white">
            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-2 pb-16 space-y-1">
                {chat.map((item, index) => {
                    // MVP: If the backend says it's a correct guess, style it green!
                    if (item.isCorrectGuess) {
                        return (
                            <div key={index} className="text-green-600 font-bold bg-green-50 p-1 rounded">
                                {item.username} guessed the word!
                            </div>
                        );
                    }
                    
                    // MVP: If it's a system message (like "Player joined")
                    if (item.isSystemMsg) {
                        return (
                            <div key={index} className="text-gray-500 italic text-sm text-center">
                                {item.text}
                            </div>
                        );
                    }

                    // Standard Chat Message
                    return (
                        <div key={index} className="text-sm">
                            <span className="font-bold text-gray-800 mr-1">
                                {item.username}:
                            </span>
                            <span className="text-gray-700 break-words">
                                {item.text}
                            </span>
                        </div>
                    );
                })}
                {/* Invisible div to force auto-scroll to bottom */}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="absolute bottom-0 w-full p-2 bg-gray-200 border-t">
                <form className="flex gap-2" onSubmit={sendMessage}>
                    <input
                        className="flex-1 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                        type="text"
                        placeholder="Guess the word..."
                        onChange={(e) => setInputText(e.currentTarget.value)}
                        value={inputText}
                    />
                    <button 
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded font-semibold transition-colors" 
                        type="submit"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
}