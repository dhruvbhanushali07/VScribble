import { createContext } from "react";
import { io, Socket } from "socket.io-client";

type MySocketType = Socket | null;

// 1. Declare the variable
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

// 2. USE the variable inside the io() function here!
export const socket: Socket = io(BACKEND_URL);

export const SocketContext = createContext<MySocketType>(null);