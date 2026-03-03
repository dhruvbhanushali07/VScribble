import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { BrowserRouter, Routes, Route } from "react-router";
import Lobby from "./components/Lobby.tsx";
import Room from "./components/Room.tsx";

createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<StrictMode>
			<Routes>
				<Route path="/" element={<App />}>
					<Route index element={<Lobby/>}/>
					<Route path="/room/:roomId" element={<Room/>}/>
				</Route>
			</Routes>
		</StrictMode>
	</BrowserRouter>,
);
