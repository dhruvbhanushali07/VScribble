import React, { useContext, useEffect, useState } from "react";
import { SocketContext } from "../context/SocketContext";
import { useParams } from "react-router";

interface ChatMessage{
    id: string | undefined;
    mssg: string ;
}


export default function Room() {

    const {roomId}=useParams() as {roomId:string}
    const socket= useContext(SocketContext)
    const [chat,setChat]= useState<string[]>([])
    const [message, setMessage]= useState<ChatMessage>({id:socket?.id,mssg:""})


    function sendMessage(e:React.FormEvent){
        e.preventDefault()
        socket?.emit("chat_message",{roomId,message})
    }

    useEffect(()=>{

        socket?.on("receive_message",(payload)=>{
            setChat((prev)=>[...prev,payload.message])
        })

        return()=>{
            socket?.off("receive_message")
        }
    })
    
    console.log(chat)
	return (
		<div className="flex w-full h-full justify-center content-center flex-wrap">
            <div>
                {
                    chat.map((item,index)=>{
                        return(
                            <div key={index}>
                                <p>{item}</p>
                            </div>
                        )
                    })
                }
            </div>
            <div>
                <form onSubmit={sendMessage}>
                    <input type="text" onChange={(e)=>{setMessage({id:socket?.id,mssg:e.currentTarget.value})}} value={message?.mssg} />
                    <button type="submit">Send</button>
                </form>
            </div>
        </div>
	);
}
