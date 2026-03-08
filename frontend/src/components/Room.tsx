import { useContext, useEffect, useState } from "react";
import Canvas from "./Canvas";
import Chat from "./Chat";
import { SocketContext } from "../context/SocketContext";
import { useLocation } from "react-router";

interface Player {
	id: string;
	username: string;
}

export default function Room() {
	const socket = useContext(SocketContext);
	const location = useLocation();
	const [allPlayer, setAllPlayers] = useState<Player[]>(
		location.state?.playerArr || [],
	);
	console.log(allPlayer);

	useEffect(() => {
		if (!socket) return;

		const handlePlayerJoined = (payload: any) => {
			console.log("Someone else joined", payload);
			setAllPlayers(payload.playerArr);
		};

		socket.on("player_joined", handlePlayerJoined);

		// 3. Clean up using the exact same named functions
		return () => {
			socket.off("player_joined", handlePlayerJoined);
		};
	}, [socket]);

	return (
		<div className="flex w-full p-4 h-full justify-center content-center flex-wrap">
			<div className="w-1/5 border-2">
				<Chat />
			</div>

			<div id="canvas" className="w-4/5 h-4/5 overflow-hidden">
				<Canvas />
			</div>

			<div className="w-full mt-4">
				<h2 className="font-bold">Players:</h2>

				{allPlayer.length === 0 ? (
					<p>No players yet</p>
				) : (
					allPlayer.map((player, index) => {
                        return<p key={index}>{player.username}</p>
                    })
				)}
			</div>
		</div>
	);
}
