import React, { useContext, useEffect, useState } from "react";
import { SocketContext } from "../context/SocketContext";
import { useNavigate } from "react-router";

export default function Lobby() {
	const [roomId, setRoomId] = useState<string>("");
    const [username,setUsername] = useState<string>("")
    const socket= useContext(SocketContext)
    const navigate=useNavigate()

    function getRoomid(e: React.FormEvent){
        e.preventDefault()
        socket?.emit("join_room",roomId,username)
    } 

    function createRoom(){
        socket?.emit("req_create_room",username)
    }

    useEffect(()=>{

        socket?.on("room_error",(err)=>{
            console.log(err)
        })

        socket?.on("join_success",(payload)=>{
            navigate(`/room/${payload.roomId}`,{state:{playerArr:payload.playerArr}});
        })

        socket?.on("res_create_room",(payload)=>{
            navigate(`/room/${payload.roomId}`,{state:{playerArr:payload.playerArr}});
        })

        return()=>{
            socket?.off("room_error")
            socket?.off("join_success")
            socket?.off("res_create_room")
        }
    })

	return (
		<div className="w-full h-full flex justify-center content-center flex-wrap">
            <div className=" flex flex-col p-4 gap-6 bg-neutral-400">
            <input type="text" className="bg-white p-2" value={username} onChange={(e)=>{setUsername(e.currentTarget.value)}} ></input>
			<form onSubmit={getRoomid}>
				<input className="p-2 rounded-xl mr-4 bg-white" type="text" value={roomId} onChange={(e)=>{setRoomId(e.currentTarget.value)}} />
                <button type="submit">Join</button>
			</form>
            <h1 className="2xl text-center">OR</h1>
            <button className="bg-white p-4 rounded-xl" onClick={createRoom}>Create room</button>
            </div>
		</div>
	);
}
