import { Outlet } from "react-router";
import { socket, SocketContext } from "./context/SocketContext";

function App() {


	return (
		<div className="w-screen h-screen">
			<SocketContext.Provider value={socket}>
			<Outlet />
		</SocketContext.Provider>
		</div>
		
	);
}

export default App;

