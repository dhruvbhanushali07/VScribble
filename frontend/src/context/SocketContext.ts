import { createContext } from "react";
import { io, Socket } from "socket.io-client";

type MySocketType = Socket | null;

export const socket: Socket = io("http://localhost:5000");

//Create the Context and give it a label (<MySocketType>).
// We start it at 'null' because the app hasn't fully loaded yet.
export const SocketContext = createContext<MySocketType>(null);