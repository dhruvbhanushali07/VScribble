import { Outlet } from "react-router";
import { socket, SocketContext } from "./context/SocketContext";

function App() {


	return (
		<SocketContext.Provider value={socket}>
			<Outlet />
		</SocketContext.Provider>
	);
}

export default App;

// import { useEffect, useRef } from "react";
// import "./App.css";

// // 1. Import DrawingUtils directly from tasks-vision.
// // Do not import from @mediapipe/hands or drawing_utils.
// import {
// 	HandLandmarker,
// 	FilesetResolver,
// 	DrawingUtils,
// } from "@mediapipe/tasks-vision";

// function App() {
// 	const videoRef = useRef(null);
// 	const canvasRef = useRef(null);
// 	const handLandmarkerRef = useRef(null);
// 	const drawingUtilsRef = useRef(null);
// 	const webcamRunningRef = useRef(false);
// 	const lastVideoTimeRef = useRef(-1);
// 	const lastPositionRef = useRef(null);

// 	useEffect(() => {
// 		async function createHandLandmarker() {
// 			const vision = await FilesetResolver.forVisionTasks(
// 				"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
// 			);

// 			handLandmarkerRef.current = await HandLandmarker.createFromOptions(
// 				vision,
// 				{
// 					baseOptions: {
// 						modelAssetPath: "/models/hand_landmarker.task",
// 						delegate: "GPU",
// 					},
// 					runningMode: "VIDEO",
// 					numHands: 2,
// 					minHandDetectionConfidence: 0.7,
// 					minHandPresenceConfidence: 0.6,
// 					minTrackingConfidence: 0.6,
// 				},
// 			);
// 			console.log("HandLandmarker loaded");
// 		}
// 		createHandLandmarker();
// 	}, []);

// 	function enableCam() {
// 		if (!handLandmarkerRef.current) return;
// 		webcamRunningRef.current = !webcamRunningRef.current;

// 		navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
// 			videoRef.current.srcObject = stream;
// 			videoRef.current.onloadeddata = () => {
// 				predictWebcam();
// 			};
// 		});
// 	}

// 	function predictWebcam() {
// 		const video = videoRef.current;
// 		const canvas = canvasRef.current;
// 		const ctx = canvas.getContext("2d");

// 		// 3. Prevent the canvas wipe! Only assign width/height if they have changed.
// 		if (
// 			canvas.width !== video.videoWidth ||
// 			canvas.height !== video.videoHeight
// 		) {
// 			canvas.width = video.videoWidth;
// 			canvas.height = video.videoHeight;
// 		}

// 		// 4. Initialize DrawingUtils once the context exists
// 		if (!drawingUtilsRef.current) {
// 			drawingUtilsRef.current = new DrawingUtils(ctx);
// 		}

// 		let startTimeMs = performance.now();

// 		if (lastVideoTimeRef.current !== video.currentTime) {
// 			lastVideoTimeRef.current = video.currentTime;
// 			const results = handLandmarkerRef.current.detectForVideo(
// 				video,
// 				startTimeMs,
// 			);

// 			ctx.save();
// 			ctx.clearRect(0, 0, canvas.width, canvas.height);

// 			if (results.landmarks && results.landmarks.length > 0) {
// 				// ctx.lineTo(
// 				// 	canvas.width * results.landmarks[0][8]["x"],
// 				// 	canvas.height * results.landmarks[0][8]["y"],
// 				// );
// 				// ctx.stroke();
// 				for (const landmarks of results.landmarks) {
// 					console.log(results.landmarks[0][8]);

// 					// 5. Use the built-in DrawingUtils and HandLandmarker.HAND_CONNECTIONS
// 					drawingUtilsRef.current.drawConnectors(
// 						landmarks,
// 						HandLandmarker.HAND_CONNECTIONS,
// 						{ color: "lime", lineWidth: 8 },
// 					);

// 					drawingUtilsRef.current.drawLandmarks(landmarks, {
// 						color: "yellow",
// 						lineWidth: 5,
// 					});
// 				}
// 			}
// 			ctx.restore();
// 		}

// 		if (webcamRunningRef.current) {
// 			requestAnimationFrame(predictWebcam);
// 		}
// 	}

// 	return (
// 		<>
// 			<h1>VScribble</h1>
// 			<button onClick={enableCam}>Start Camera</button>
// 			<div style={{ position: "relative" }}>
// 				<video
// 					ref={videoRef}
// 					autoPlay
// 					playsInline
// 					style={{ position: "absolute", transform: "scaleX(-1)" }}
// 				/>
// 				<canvas
// 					ref={canvasRef}
// 					style={{
// 						position: "absolute",
// 						left: 0,
// 						top: 0,
// 						transform: "scaleX(-1)",
// 					}}
// 				/>
// 			</div>
// 		</>
// 	);
// }

// export default App;
