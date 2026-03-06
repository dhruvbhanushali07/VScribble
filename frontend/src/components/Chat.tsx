import React, { useContext, useState, useEffect } from "react";
import { SocketContext } from "../context/SocketContext";
import { useParams } from "react-router";

interface ChatMessage {
	id: string | undefined;
	text: string;
}

export default function Chat() {
	const socket = useContext(SocketContext);
	const [chat, setChat] = useState<ChatMessage[]>([]);
	const [message, setMessage] = useState<ChatMessage>({
		id: socket?.id,
		text: "",
	});
	const { roomId } = useParams() as { roomId: string };
	function sendMessage(e: React.FormEvent) {
		e.preventDefault();
		socket?.emit("chat_message", { roomId , message });
	}

	useEffect(() => {
		socket?.on("receive_message", (payload) => {
			setChat((prev) => [...prev, payload]);
		});

		return () => {
			socket?.off("receive_message");
		};
	});

	console.log(chat);
	return (
		<div className="size-full relative">
			<div>
				{chat.map((item, index) => {
					return (
						<div key={index}>
							<p>
								{item.id}:{item.text}
							</p>
						</div>
					);
				})}
			</div>
			<div className="absolute p-4 w-full  bottom-0">
				<form className="w-full flex gap-2 justify-around" onSubmit={sendMessage}>
					<input
						className="border rounded-xl bg-neutral-100 p-2 w-4/5"
						type="text"
                        placeholder="Guess the word"
						onChange={(e) => {
							setMessage({
								id: socket?.id,
								text: e.currentTarget.value,
							});
						}}
						value={message?.text}
					/>
					<button className="bg-blue-700 text-white p-2 px-4 rounded-lg" type="submit">Send</button>
				</form>
			</div>
		</div>
	);
}
