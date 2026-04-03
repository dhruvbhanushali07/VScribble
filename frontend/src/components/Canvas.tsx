import React, { useContext, useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useParams } from "react-router";
import { SocketContext } from "../context/SocketContext";

class OneEuroFilter {
	minCutoff: number;
	beta: number;
	dCutoff: number;
	xCurr: number | null;
	dxCurr: number;
	tCurr: number;

	constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
		this.minCutoff = minCutoff;
		this.beta = beta;
		this.dCutoff = dCutoff;
		this.xCurr = null;
		this.dxCurr = 0;
		this.tCurr = 0;
	}

	alpha(t: number, cutoff: number) {
		const tau = 1.0 / (2 * Math.PI * cutoff);
		return 1.0 / (1.0 + tau / t);
	}

	filter(t: number, x: number) {
		if (this.xCurr === null) {
			this.xCurr = x;
			this.tCurr = t;
			return x;
		}
		const dt = t - this.tCurr;
		if (dt <= 0) return this.xCurr;

		const alphaD = this.alpha(dt, this.dCutoff);
		const dx = (x - this.xCurr) / dt;
		this.dxCurr = this.dxCurr + alphaD * (dx - this.dxCurr);

		const cutoff = this.minCutoff + this.beta * Math.abs(this.dxCurr);
		const alpha = this.alpha(dt, cutoff);

		this.xCurr = this.xCurr + alpha * (x - this.xCurr);
		this.tCurr = t;
		return this.xCurr;
	}

	reset() {
		this.xCurr = null;
		this.dxCurr = 0;
		this.tCurr = 0;
	}
}

// ==========================================
// CONSTANTS
// ==========================================
const COLORS = [
	"#000000",
	"#FF0000",
	"#00FF00",
	"#0000FF",
	"#FFFF00",
	"#FF00FF",
	"#00FFFF",
	"#FFA500",
	"#800080",
	"#FFFFFF",
];

const MIN_CUTOFF = 1.0;
const BETA = 0.008;
const PREDICTION_FACTOR = 0.3;
const JITTER_THRESHOLD = 0.5;

// ==========================================
// COMPONENT
// ==========================================
const Canvas = () => {
	const socket = useContext(SocketContext);
	const { roomId } = useParams<{ roomId: string }>();

	const [color, setColor] = useState<string>("#000000");
	const [lineWidth, setLineWidth] = useState<number>(10);
	const [isCamReady, setIsCamReady] = useState<boolean>(false);
	const [airDrawStatus, setAirDrawStatus] = useState<string>("Camera Off");

	const colorRef = useRef(color);
	const lineWidthRef = useRef(lineWidth);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);

	const handLandmarkerRef = useRef<HandLandmarker | null>(null);
	const webcamRunningRef = useRef<boolean>(false);
	const rvfcHandleRef = useRef<number | null>(null);

	const filterXRef = useRef(new OneEuroFilter(MIN_CUTOFF, BETA));
	const filterYRef = useRef(new OneEuroFilter(MIN_CUTOFF, BETA));

	const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
	const prevPosRef = useRef<{ x: number; y: number } | null>(null);
	const lastMidPointRef = useRef<{ x: number; y: number } | null>(null);
	const isDrawingRef = useRef<boolean>(false);
	const statusRef = useRef<string>("Camera Off");

	const pointsBufferRef = useRef<{ x: number; y: number }[]>([]);
	const lastWristRef = useRef<{ x: number; y: number } | null>(null);
	const wristVelRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

	// Track remote drawing position
	const remotePrevPosRef = useRef<{ x: number; y: number } | null>(null);

	// Keep refs updated with latest color and line width for use in event handlers
	useEffect(() => {
		colorRef.current = color;
		lineWidthRef.current = lineWidth;
	}, [color, lineWidth]);

	// ── MVP: EMIT DRAW FUNCTION ──────────────────────────────────────────────
	const emitDraw = (type: "start" | "draw" | "end", x: number, y: number) => {
		if (!socket || !roomId || !canvasRef.current) return;

		const canvas = canvasRef.current;
		// Normalize the coordinates and size relative to the canvas width
		const normX = x / canvas.width;
		const normY = y / canvas.height;
		const normSize = lineWidthRef.current / canvas.width;

		socket.emit("draw_event", {
			roomId,
			type,
			x: normX,
			y: normY,
			color: colorRef.current,
			size: normSize,
		});
	};

	// ── MVP: LISTEN FOR REMOTE DRAWING ───────────────────────────────────────
	useEffect(() => {
		if (!socket) return;

		const handleRemoteDraw = (data: any) => {
			const canvas = canvasRef.current;
			const ctx = canvas?.getContext("2d");
			if (!canvas || !ctx) return;

			// Scale normalized data back up to the local screen size
			const localX = data.x * canvas.width;
			const localY = data.y * canvas.height;
			const localSize = data.size * canvas.width;

			ctx.strokeStyle = data.color;
			ctx.lineWidth = localSize;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";

			if (data.type === "start") {
				ctx.beginPath();
				ctx.moveTo(localX, localY);
				remotePrevPosRef.current = { x: localX, y: localY };
			} else if (data.type === "draw" && remotePrevPosRef.current) {
				ctx.beginPath();
				ctx.moveTo(
					remotePrevPosRef.current.x,
					remotePrevPosRef.current.y,
				);
				ctx.lineTo(localX, localY);
				ctx.stroke();
				remotePrevPosRef.current = { x: localX, y: localY };
			} else if (data.type === "end") {
				ctx.closePath();
				remotePrevPosRef.current = null;
			}
		};

		const handleRemoteClear = () => {
			const canvas = canvasRef.current;
			canvas
				?.getContext("2d")
				?.clearRect(0, 0, canvas.width, canvas.height);
		};

		socket.on("draw_event", handleRemoteDraw);
		socket.on("clear_canvas", handleRemoteClear);

		return () => {
			socket.off("draw_event", handleRemoteDraw);
			socket.off("clear_canvas", handleRemoteClear);
		};
	}, [socket]);

	// ── 1. Load MediaPipe model ──────────────────────────────────────────────
	useEffect(() => {
		async function createHandLandmarker() {
			try {
				const vision = await FilesetResolver.forVisionTasks(
					"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
				);
				handLandmarkerRef.current =
					await HandLandmarker.createFromOptions(vision, {
						baseOptions: {
							modelAssetPath: `../../models/hand_landmarker.task`,
							delegate: "GPU",
						},
						runningMode: "VIDEO",
						numHands: 1,
						minHandDetectionConfidence: 0.7,
						minHandPresenceConfidence: 0.6,
						minTrackingConfidence: 0.6,
					});
				setIsCamReady(true);
			} catch (error) {
				console.error("AI load error:", error);
			}
		}
		createHandLandmarker();
		return () => stopCamera();
	}, []);

    useEffect(() => {
    const handleResize = () => {
        const canvas = canvasRef.current;
        const cursorCanvas = cursorCanvasRef.current;
        
        if (canvas && cursorCanvas) {
            // Only update if the dimensions actually changed
            if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
                // Note: Changing canvas.width clears the canvas content!
                // If you want to keep your drawing during resize, 
                // you'd need to save the data to a temporary variable first.
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
                cursorCanvas.width = cursorCanvas.offsetWidth;
                cursorCanvas.height = cursorCanvas.offsetHeight;
            }
        }
    };

    // Initialize size
    handleResize();

    // Listen for window resize
    window.addEventListener("resize", handleResize);
    
    return () => window.removeEventListener("resize", handleResize);
}, []);

	// ── 2. Mouse drawing fallback ────────────────────────────────────────────
	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		let isMouseDrawing = false;

		const onDown = (e: MouseEvent) => {
			isMouseDrawing = true;
			ctx.beginPath();
			ctx.moveTo(e.offsetX, e.offsetY);
			ctx.strokeStyle = colorRef.current;
			ctx.lineWidth = lineWidthRef.current;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";

			emitDraw("start", e.offsetX, e.offsetY);
		};
		const onMove = (e: MouseEvent) => {
			if (!isMouseDrawing) return;
			ctx.lineTo(e.offsetX, e.offsetY);
			ctx.stroke();

			// MVP Integration
			emitDraw("draw", e.offsetX, e.offsetY);
		};
		const onUp = () => {
			if (isMouseDrawing) {
				isMouseDrawing = false;
				ctx.closePath();

				// MVP Integration
				emitDraw("end", 0, 0);
			}
		};

		const top = cursorCanvasRef.current;
		if (top) {
			top.addEventListener("mousedown", onDown);
			top.addEventListener("mousemove", onMove);
			top.addEventListener("mouseup", onUp);
			top.addEventListener("mouseleave", onUp);
		}
		return () => {
			if (top) {
				top.removeEventListener("mousedown", onDown);
				top.removeEventListener("mousemove", onMove);
				top.removeEventListener("mouseup", onUp);
				top.removeEventListener("mouseleave", onUp);
			}
		};
	}, [color, lineWidth, socket, roomId]); // Added dependencies to keep emitDraw fresh

	// ── Helpers ──────────────────────────────────────────────────────────────
	const updateStatus = (s: string) => {
		if (statusRef.current !== s) {
			statusRef.current = s;
			setAirDrawStatus(s);
		}
	};

	const resetFiltersAndMemory = () => {
		if (isDrawingRef.current) {
			emitDraw("end", 0, 0); // Safeguard stop
		}
		isDrawingRef.current = false;
		prevPosRef.current = null;
		lastMidPointRef.current = null;
		smoothedPosRef.current = null;
		pointsBufferRef.current = [];
		lastWristRef.current = null;
		wristVelRef.current = { x: 0, y: 0 };
		filterXRef.current.reset();
		filterYRef.current.reset();
	};

	const stopCamera = () => {
		webcamRunningRef.current = false;

		if (rvfcHandleRef.current !== null && videoRef.current) {
			videoRef.current.cancelVideoFrameCallback(rvfcHandleRef.current);
			rvfcHandleRef.current = null;
		}

		if (videoRef.current?.srcObject) {
			(videoRef.current.srcObject as MediaStream)
				.getTracks()
				.forEach((t) => t.stop());
			videoRef.current.srcObject = null;
		}

		cursorCanvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);

		resetFiltersAndMemory();
		updateStatus("Camera Off");
	};

	// ── 3. Start camera ──────────────────────────────────────────────────────
	const toggleAirDraw = async () => {
		if (!handLandmarkerRef.current) return;
		if (webcamRunningRef.current) {
			stopCamera();
			return;
		}

		webcamRunningRef.current = true;
		updateStatus("Starting Camera...");

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { width: 1280, height: 720 },
			});
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				videoRef.current.onloadeddata = () => {
					videoRef.current?.play();
					scheduleNextFrame();
				};
			}
		} catch {
			updateStatus("Camera Access Denied");
			webcamRunningRef.current = false;
		}
	};

	// ── 4. requestVideoFrameCallback loop ────────────────────────────────────
	const scheduleNextFrame = () => {
		const video = videoRef.current;
		if (!video || !webcamRunningRef.current) return;

		rvfcHandleRef.current = video.requestVideoFrameCallback(
			(now: number, metadata: VideoFrameCallbackMetadata) => {
				if (!webcamRunningRef.current) return;
				processFrame(metadata);
				scheduleNextFrame();
			},
		);
	};

	// ── 5. Per-frame processing ──────────────────────────────────────────────
	const processFrame = (metadata: VideoFrameCallbackMetadata) => {
		const video = videoRef.current;
		const canvas = canvasRef.current;
		const cursorCanvas = cursorCanvasRef.current;
		if (!canvas || !cursorCanvas || !video || !handLandmarkerRef.current)
			return;

		if (
			canvas.width !== canvas.offsetWidth ||
			canvas.height !== canvas.offsetHeight
		) {
			canvas.width = canvas.offsetWidth;
			canvas.height = canvas.offsetHeight;
			cursorCanvas.width = cursorCanvas.offsetWidth;
			cursorCanvas.height = cursorCanvas.offsetHeight;
		}

		const ctx = canvas.getContext("2d");
		const cursorCtx = cursorCanvas.getContext("2d");
		if (!ctx || !cursorCtx) return;

		cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

		const timeSeconds = metadata.mediaTime;
		const nowMs = timeSeconds * 1000;

		const results = handLandmarkerRef.current.detectForVideo(video, nowMs);

		if (results.landmarks?.length > 0) {
			processHand(
				results.landmarks[0],
				ctx,
				cursorCtx,
				canvas,
				timeSeconds,
			);
		} else {
			updateStatus("No Hands Detected");
			resetFiltersAndMemory();
		}
	};

	// ── 6. Hand processing & drawing ────────────────────────────────────────
	const processHand = (
		hand: any[],
		ctx: CanvasRenderingContext2D,
		cursorCtx: CanvasRenderingContext2D,
		canvas: HTMLCanvasElement,
		timeSec: number,
	) => {
		const indexTip = hand[8];
		const indexPip = hand[6];
		const middleTip = hand[12];
		const middlePip = hand[10];
		const ringTip = hand[16];
		const ringPip = hand[14];
		const wrist = hand[0];

		const isIndexUp = indexTip.y < indexPip.y;
		const isMiddleDown = middleTip.y > middlePip.y;
		const isRingDown = ringTip.y > ringPip.y;
		const shouldDraw = isIndexUp && isMiddleDown && isRingDown;

		if (shouldDraw && !isDrawingRef.current) {
			isDrawingRef.current = true;
			pointsBufferRef.current = [];
			// MVP Integration: Stroke Started
			emitDraw(
				"start",
				smoothedPosRef.current?.x || 0,
				smoothedPosRef.current?.y || 0,
			);
		} else if (!shouldDraw && isDrawingRef.current) {
			isDrawingRef.current = false;
			pointsBufferRef.current = [];
			prevPosRef.current = null;
			lastMidPointRef.current = null;
			// MVP Integration: Stroke Ended
			emitDraw("end", 0, 0);
		}

		const wristX = (1 - wrist.x) * canvas.width;
		const wristY = wrist.y * canvas.height;

		if (lastWristRef.current) {
			wristVelRef.current = {
				x: wristX - lastWristRef.current.x,
				y: wristY - lastWristRef.current.y,
			};
		}
		lastWristRef.current = { x: wristX, y: wristY };

		const rawX = (1 - indexTip.x) * canvas.width;
		const rawY = indexTip.y * canvas.height;

		const predictedX = rawX + wristVelRef.current.x * PREDICTION_FACTOR;
		const predictedY = rawY + wristVelRef.current.y * PREDICTION_FACTOR;

		const sX = filterXRef.current.filter(timeSec, predictedX);
		const sY = filterYRef.current.filter(timeSec, predictedY);
		const currPos = { x: sX, y: sY };
		smoothedPosRef.current = currPos;

		cursorCtx.beginPath();
		cursorCtx.arc(
			currPos.x,
			currPos.y,
			lineWidthRef.current / 2 + 2,
			0,
			2 * Math.PI,
		);
		cursorCtx.fillStyle = isDrawingRef.current
			? colorRef.current
			: "rgba(100,100,100,0.4)";
		cursorCtx.fill();
		cursorCtx.strokeStyle = "white";
		cursorCtx.lineWidth = 2;
		cursorCtx.stroke();

		if (isDrawingRef.current) {
			updateStatus("Drawing...");

			// MVP Integration: Send the continuous stream of points
			emitDraw("draw", currPos.x, currPos.y);

			pointsBufferRef.current.push({ ...currPos });
			const pts = pointsBufferRef.current;

			if (pts.length >= 2) {
				const prev = pts[pts.length - 2];
				const curr = pts[pts.length - 1];
				const distMoved = Math.hypot(curr.x - prev.x, curr.y - prev.y);

				if (distMoved > JITTER_THRESHOLD) {
					ctx.beginPath();
					ctx.strokeStyle = colorRef.current;
					ctx.lineWidth = lineWidthRef.current;
					ctx.lineCap = "round";
					ctx.lineJoin = "round";

					ctx.moveTo(pts[0].x, pts[0].y);
					for (let i = 1; i < pts.length - 1; i++) {
						const midX = (pts[i].x + pts[i + 1].x) / 2;
						const midY = (pts[i].y + pts[i + 1].y) / 2;
						ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
					}
					ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
					ctx.stroke();

					pointsBufferRef.current = [pts[pts.length - 1]];
				}
			}
		} else {
			updateStatus("Hovering");
		}
	};

	// ── 7. Clear canvas ──────────────────────────────────────────────────────
	const clearCanvas = () => {
		canvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);
		socket?.emit("clear_canvas", roomId);
	};

	// ── 8. Render ────────────────────────────────────────────────────────────
	return (
		<div className="flex flex-col items-center w-full gap-4">
			<div className="flex flex-wrap items-center justify-between w-full p-4 bg-gray-100 rounded-lg shadow-md gap-4">
				<div className="flex gap-2 p-2 bg-white rounded-lg shadow-inner">
					{COLORS.map((c) => (
						<div
							key={c}
							onClick={() => setColor(c)}
							className={`w-8 h-8 rounded cursor-pointer border-2 transition-transform hover:scale-110 ${
								color === c
									? "border-blue-500 scale-110 shadow-lg"
									: "border-gray-300"
							}`}
							style={{ backgroundColor: c }}
							title={c === "#FFFFFF" ? "Eraser" : c}
						/>
					))}
				</div>

				<div className="flex flex-col">
					<label className="text-sm font-bold text-gray-700">
						Brush Size: {lineWidth}px
					</label>
					<input
						type="range"
						min="2"
						max="40"
						value={lineWidth}
						onChange={(e) => setLineWidth(parseInt(e.target.value))}
						className="w-32 cursor-pointer accent-blue-600"
					/>
				</div>

				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2 text-sm font-semibold px-3 py-1 bg-white border border-gray-300 rounded-full w-48 shadow-sm">
						<span
							className={`w-3 h-3 rounded-full flex-shrink-0 ${
								airDrawStatus === "Drawing..."
									? "bg-green-500 animate-pulse"
									: airDrawStatus === "Hovering"
										? "bg-yellow-400"
										: airDrawStatus === "Camera Off"
											? "bg-gray-400"
											: "bg-red-500"
							}`}
						/>
						<span className="truncate">{airDrawStatus}</span>
					</div>

					<button
						onClick={clearCanvas}
						className="px-4 py-2 bg-red-500 text-white font-bold rounded shadow hover:bg-red-600"
					>
						Clear
					</button>

					<button
						onClick={toggleAirDraw}
						disabled={!isCamReady}
						className={`px-4 py-2 font-bold text-white rounded shadow w-40 ${
							!isCamReady
								? "bg-gray-400 cursor-not-allowed"
								: webcamRunningRef.current
									? "bg-gray-800 hover:bg-gray-900"
									: "bg-blue-600 hover:bg-blue-700"
						}`}
					>
						{!isCamReady
							? "Loading AI..."
							: webcamRunningRef.current
								? "Stop Camera"
								: "Start Camera"}
					</button>
				</div>
			</div>

			<div className="relative w-full max-w-5xl aspect-video border-4 box-border border-gray-800 rounded-xl overflow-hidden shadow-2xl bg-black">
				<video
					ref={videoRef}
					autoPlay
					playsInline
					className="absolute bg-white inset-0 w-full h-full object-fill -scale-x-100"
				/>
				<div className="absolute inset-0 bg-white/70 pointer-events-none" />
				<canvas
					ref={canvasRef}
					className="absolute inset-0 w-full h-full pointer-events-none"
				/>
				<canvas
					ref={cursorCanvasRef}
					className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
				/>
			</div>

			<p className="text-sm text-gray-500 font-medium">
				Point index finger UP and curl other fingers DOWN to draw. Open
				hand to hover.
			</p>
		</div>
	);
};

export default Canvas;
