import { createContext } from "react";
import { io, Socket } from "socket.io-client";

type MySocketType = Socket | null;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
export const socket: Socket = io("http://localhost:5000");


export const SocketContext = createContext<MySocketType>(null);