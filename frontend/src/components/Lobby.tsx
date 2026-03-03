import React, { useContext, useEffect, useState } from "react";
import { SocketContext } from "../context/SocketContext";
import { useNavigate } from "react-router";

export default function Lobby() {
	const [roomId, setRoomId] = useState<string>("");
    const socket= useContext(SocketContext)
    const navigate=useNavigate()

    function getRoomid(e: React.FormEvent){
        e.preventDefault()
        socket?.emit("join_room",roomId)
        console.log("joined")
    } 

    function createRoom(){
        socket?.emit("req_create_room")
    }

    useEffect(()=>{

        socket?.on("room_error",(err)=>{
            console.log(err)
        })

        socket?.on("join_success",(payload)=>{
            navigate(`/room/${payload.roomId}`);
        })

        socket?.on("res_create_room",(payload)=>{
            navigate(`/room/${payload.roomId}`);
        })
    })

	return (
		<div>
			<form onSubmit={getRoomid}>
				<input type="text" value={roomId} onChange={(e)=>{setRoomId(e.currentTarget.value)}} />
                <button type="submit">Join</button>
			</form>
            <h1 className="2xl">OR</h1>
            <button onClick={createRoom}>Create room</button>
		</div>
	);
}
