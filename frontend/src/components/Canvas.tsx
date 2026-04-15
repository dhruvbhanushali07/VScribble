import React, { useContext, useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useParams } from "react-router";
import { SocketContext } from "../context/SocketContext";
import { Undo, Redo, Trash2 } from "lucide-react"; 

class OneEuroFilter {
    minCutoff: number; beta: number; dCutoff: number; xCurr: number | null; dxCurr: number; tCurr: number;
    constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
        this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
        this.xCurr = null; this.dxCurr = 0; this.tCurr = 0;
    }
    alpha(t: number, cutoff: number) { return 1.0 / (1.0 + (1.0 / (2 * Math.PI * cutoff)) / t); }
    filter(t: number, x: number) {
        if (this.xCurr === null) { this.xCurr = x; this.tCurr = t; return x; }
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
    reset() { this.xCurr = null; this.dxCurr = 0; this.tCurr = 0; }
}

const COLORS = [
    "#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", 
    "#FF00FF", "#00FFFF", "#FFA500", "#800080", "#FFFFFF"
];

const MIN_CUTOFF = 1.0; const BETA = 0.008; const PREDICTION_FACTOR = 0.3;
const JITTER_THRESHOLD = 0.5;

type DrawEvent = { type: "start" | "draw" | "end"; x: number; y: number; color: string; size: number };

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
    const isDrawingRef = useRef<boolean>(false);
    const statusRef = useRef<string>("Camera Off");

    const pointsBufferRef = useRef<{ x: number; y: number }[]>([]);
    const lastWristRef = useRef<{ x: number; y: number } | null>(null);
    const wristVelRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const remotePrevPosRef = useRef<{ x: number; y: number } | null>(null);

    // --- UNDO/REDO STATE ---
    const localStrokesRef = useRef<DrawEvent[][]>([]);
    const redoStackRef = useRef<DrawEvent[][]>([]);
    const currentStrokeRef = useRef<DrawEvent[] | null>(null);
    const fistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { colorRef.current = color; lineWidthRef.current = lineWidth; }, [color, lineWidth]);

    // ── 1. DRAWING LOGIC (Shared for Local, Remote, and Redo) ──
    const executeDrawEvent = (data: DrawEvent, isLocal: boolean) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const localX = isLocal ? data.x : data.x * canvas.width;
        const localY = isLocal ? data.y : data.y * canvas.height;
        const localSize = isLocal ? data.size : data.size * canvas.width;

        // TRUE ERASER LOGIC: "destination-out" deletes pixels, leaving transparency
        if (data.color === "ERASER") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.strokeStyle = "rgba(0,0,0,1)"; // Color doesn't matter for destination-out, it just deletes
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = data.color;
        }
        
        ctx.lineWidth = localSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (data.type === "start") {
            ctx.beginPath();
            ctx.moveTo(localX, localY);
            remotePrevPosRef.current = { x: localX, y: localY };
        } else if (data.type === "draw" && remotePrevPosRef.current) {
            ctx.beginPath();
            ctx.moveTo(remotePrevPosRef.current.x, remotePrevPosRef.current.y);
            ctx.lineTo(localX, localY);
            ctx.stroke();
            remotePrevPosRef.current = { x: localX, y: localY };
        } else if (data.type === "end") {
            ctx.closePath();
            remotePrevPosRef.current = null;
        }
    };

    // ── 2. SOCKET EMITTER & HISTORY TRACKER ──
    const emitDraw = (type: "start" | "draw" | "end", x: number, y: number, isEraser = false) => {
        if (!socket || !roomId || !canvasRef.current) return;

        const canvas = canvasRef.current;
        
        const activeColor = isEraser ? "ERASER" : colorRef.current;
        const activeSize = isEraser ? lineWidthRef.current * 2 : lineWidthRef.current;

        const normX = x / canvas.width;
        const normY = y / canvas.height;
        const normSize = activeSize / canvas.width;

        const eventData: DrawEvent = { type, x: normX, y: normY, color: activeColor, size: normSize };

        if (type === "start") {
            currentStrokeRef.current = [eventData];
            redoStackRef.current = []; 
        } else if (type === "draw" && currentStrokeRef.current) {
            currentStrokeRef.current.push(eventData);
        } else if (type === "end" && currentStrokeRef.current) {
            localStrokesRef.current.push(currentStrokeRef.current);
            currentStrokeRef.current = null;
        }

        socket.emit("draw_event", { roomId, ...eventData });
    };

    // ── 3. SOCKET LISTENERS (Late Joiners) ──
    useEffect(() => {
        if (!socket) return;

        const handleRemoteDraw = (data: DrawEvent) => executeDrawEvent(data, false);
        const handleRemoteClear = () => canvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);
        
        const handleCanvasHistory = (history: DrawEvent[]) => {
            handleRemoteClear();
            history.forEach(event => executeDrawEvent(event, false));
        };

        socket.on("draw_event", handleRemoteDraw);
        socket.on("clear_canvas", handleRemoteClear);
        socket.on("canvas_history", handleCanvasHistory);

        return () => {
            socket.off("draw_event", handleRemoteDraw);
            socket.off("clear_canvas", handleRemoteClear);
            socket.off("canvas_history", handleCanvasHistory);
        };
    }, [socket]);

    // ── 4. MOUSE DRAWING FALLBACK ──
    useEffect(() => {
        const topCanvas = cursorCanvasRef.current;
        if (!topCanvas) return;

        let isMouseDrawing = false;

        const onDown = (e: MouseEvent) => {
            if (webcamRunningRef.current) return;

            isMouseDrawing = true;
            const rect = topCanvas.getBoundingClientRect();
            const scaleX = topCanvas.width / rect.width;
            const scaleY = topCanvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            const isEraser = e.button === 2; 
            const activeColor = isEraser ? "ERASER" : colorRef.current;
            const activeSize = isEraser ? lineWidthRef.current * 2 : lineWidthRef.current;

            executeDrawEvent({ type: "start", x, y, color: activeColor, size: activeSize }, true);
            emitDraw("start", x, y, isEraser);
        };

        const onMove = (e: MouseEvent) => {
            if (!isMouseDrawing) return;
            const rect = topCanvas.getBoundingClientRect();
            const scaleX = topCanvas.width / rect.width;
            const scaleY = topCanvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            const isEraser = e.button === 2;
            const activeColor = isEraser ? "ERASER" : colorRef.current;
            const activeSize = isEraser ? lineWidthRef.current * 2 : lineWidthRef.current;

            executeDrawEvent({ type: "draw", x, y, color: activeColor, size: activeSize }, true);
            emitDraw("draw", x, y, isEraser);
        };

        const onUp = () => {
            if (isMouseDrawing) {
                isMouseDrawing = false;
                executeDrawEvent({ type: "end", x: 0, y: 0, color: "", size: 0 }, true);
                emitDraw("end", 0, 0);
            }
        };

        const onContextMenu = (e: Event) => e.preventDefault(); 

        topCanvas.addEventListener("mousedown", onDown);
        topCanvas.addEventListener("mousemove", onMove);
        topCanvas.addEventListener("mouseup", onUp);
        topCanvas.addEventListener("mouseleave", onUp);
        topCanvas.addEventListener("contextmenu", onContextMenu);

        return () => {
            topCanvas.removeEventListener("mousedown", onDown);
            topCanvas.removeEventListener("mousemove", onMove);
            topCanvas.removeEventListener("mouseup", onUp);
            topCanvas.removeEventListener("mouseleave", onUp);
            topCanvas.removeEventListener("contextmenu", onContextMenu);
        };
    }, [socket, roomId]);

    // ── 5. LOAD AI ──
    useEffect(() => {
        async function createHandLandmarker() {
            try {
                const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
                handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: { modelAssetPath: `../../models/hand_landmarker.task`, delegate: "GPU" },
                    runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: 0.7, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
                });
                setIsCamReady(true);
            } catch (error) { console.error("AI load error:", error); }
        }
        createHandLandmarker();
        return () => stopCamera();
    }, []);

    // Resize Handler
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            const cursorCanvas = cursorCanvasRef.current;
            if (!canvas || !cursorCanvas) return;
            canvas.width = 1280; canvas.height = 720;
            cursorCanvas.width = 1280; cursorCanvas.height = 720;

            if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
                const ctx = canvas.getContext("2d");
                const savedImage = ctx?.getImageData(0, 0, canvas.width, canvas.height);
                canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
                cursorCanvas.width = cursorCanvas.offsetWidth; cursorCanvas.height = cursorCanvas.offsetHeight;
                if (savedImage) ctx?.putImageData(savedImage, 0, 0);
            }
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // ── 6. HAND TRACKING & GESTURES ──
    const processHand = (hand: any[], ctx: CanvasRenderingContext2D, cursorCtx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, timeSec: number) => {
        const indexTip = hand[8]; const indexPip = hand[6];
        const middleTip = hand[12]; const middlePip = hand[10];
        const ringTip = hand[16]; const ringPip = hand[14];
        const pinkyTip = hand[20]; const pinkyPip = hand[18];
        const wrist = hand[0];

        const isIndexUp = indexTip.y < indexPip.y;
        const isMiddleUp = middleTip.y < middlePip.y;
        const isRingUp = ringTip.y < ringPip.y;
        const isPinkyUp = pinkyTip.y < pinkyPip.y;

        // NEW GESTURES
        const isDrawGesture = isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp; // 1 finger (Index)
        const isEraseGesture = isIndexUp && isMiddleUp && isRingUp && !isPinkyUp;  // 3 fingers (Index + Middle + Ring)
        const isClearGesture = !isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp; // Fist

        if (isClearGesture) {
            if (!fistTimerRef.current) {
                updateStatus("Hold Fist to Clear...");
                fistTimerRef.current = setTimeout(() => {
                    clearCanvas();
                    fistTimerRef.current = null;
                }, 1000);
            }
            return; 
        } else if (fistTimerRef.current) {
            clearTimeout(fistTimerRef.current);
            fistTimerRef.current = null;
        }

        const shouldInteract = isDrawGesture || isEraseGesture;

        if (shouldInteract && !isDrawingRef.current) {
            isDrawingRef.current = true;
            pointsBufferRef.current = [];
            emitDraw("start", smoothedPosRef.current?.x || 0, smoothedPosRef.current?.y || 0, isEraseGesture);
            
            // True eraser local setup
            if (isEraseGesture) {
                ctx.globalCompositeOperation = "destination-out";
                ctx.strokeStyle = "rgba(0,0,0,1)";
            } else {
                ctx.globalCompositeOperation = "source-over";
                ctx.strokeStyle = colorRef.current;
            }
            
            ctx.lineWidth = isEraseGesture ? lineWidthRef.current * 2 : lineWidthRef.current;
            ctx.lineCap = "round"; ctx.lineJoin = "round";
        } else if (!shouldInteract && isDrawingRef.current) {
            isDrawingRef.current = false;
            pointsBufferRef.current = [];
            emitDraw("end", 0, 0);
        }

        const wristX = (1 - wrist.x) * canvas.width;
        const wristY = wrist.y * canvas.height;
        if (lastWristRef.current) wristVelRef.current = { x: wristX - lastWristRef.current.x, y: wristY - lastWristRef.current.y };
        lastWristRef.current = { x: wristX, y: wristY };

        const rawX = (1 - indexTip.x) * canvas.width;
        const rawY = indexTip.y * canvas.height;
        const predictedX = rawX + wristVelRef.current.x * PREDICTION_FACTOR;
        const predictedY = rawY + wristVelRef.current.y * PREDICTION_FACTOR;
        
        const currPos = { 
            x: filterXRef.current.filter(timeSec, predictedX), 
            y: filterYRef.current.filter(timeSec, predictedY) 
        };
        smoothedPosRef.current = currPos;

        cursorCtx.beginPath();
        cursorCtx.arc(currPos.x, currPos.y, (isEraseGesture ? lineWidthRef.current : lineWidthRef.current / 2) + 2, 0, 2 * Math.PI);
        cursorCtx.strokeStyle = isEraseGesture ? "#999999" : colorRef.current;
        cursorCtx.stroke();

        if (isDrawingRef.current) {
            updateStatus(isEraseGesture ? "Erasing..." : "Drawing...");
            pointsBufferRef.current.push({ ...currPos });
            const pts = pointsBufferRef.current;

            if (pts.length >= 2) {
                const prev = pts[pts.length - 2];
                const curr = pts[pts.length - 1];
                if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > JITTER_THRESHOLD) {
                    
                    ctx.beginPath();
                    ctx.moveTo(prev.x, prev.y);
                    ctx.lineTo(currPos.x, currPos.y);
                    ctx.stroke();

                    emitDraw("draw", currPos.x, currPos.y, isEraseGesture);
                    pointsBufferRef.current = [pts[pts.length - 1]];
                }
            }
        } else {
            updateStatus("Hovering"); // 2 fingers up, or open hand, etc. falls under hovering
        }
    };

    // ── 7. LOOP & CAMERA ──
    const processFrame = () => {
        const video = videoRef.current; const canvas = canvasRef.current; const cursorCanvas = cursorCanvasRef.current;
        if (!canvas || !cursorCanvas || !video || !handLandmarkerRef.current) return;
        
        const ctx = canvas.getContext("2d"); const cursorCtx = cursorCanvas.getContext("2d");
        if (!ctx || !cursorCtx) return;
        
        cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        const results = handLandmarkerRef.current.detectForVideo(video, performance.now() / 1000);
        
        if (results.landmarks?.length > 0) {
            processHand(results.landmarks[0], ctx, cursorCtx, canvas, performance.now() / 1000);
        } else {
            updateStatus("No Hands Detected");
            resetFiltersAndMemory();
        }
    };

    const scheduleNextFrame = () => {
        if (!videoRef.current || !webcamRunningRef.current) return;
        rvfcHandleRef.current = videoRef.current.requestVideoFrameCallback(() => {
            if (!webcamRunningRef.current) return;
            processFrame(); scheduleNextFrame();
        });
    };

    const toggleAirDraw = async () => {
        if (!handLandmarkerRef.current) return;
        if (webcamRunningRef.current) return stopCamera();
        webcamRunningRef.current = true; updateStatus("Starting Camera...");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadeddata = () => { videoRef.current?.play(); scheduleNextFrame(); };
            }
        } catch { updateStatus("Camera Access Denied"); webcamRunningRef.current = false; }
    };

    const stopCamera = () => {
        webcamRunningRef.current = false;
        if (rvfcHandleRef.current !== null && videoRef.current) { videoRef.current.cancelVideoFrameCallback(rvfcHandleRef.current); rvfcHandleRef.current = null; }
        if (videoRef.current?.srcObject) { (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop()); videoRef.current.srcObject = null; }
        cursorCanvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);
        resetFiltersAndMemory(); updateStatus("Camera Off");
    };

    const resetFiltersAndMemory = () => {
        if (isDrawingRef.current) emitDraw("end", 0, 0);
        isDrawingRef.current = false; pointsBufferRef.current = []; lastWristRef.current = null; wristVelRef.current = { x: 0, y: 0 };
        filterXRef.current.reset(); filterYRef.current.reset();
    };

    const updateStatus = (s: string) => { if (statusRef.current !== s) { statusRef.current = s; setAirDrawStatus(s); }};

    // ── 8. TOOLS (Clear, Undo, Redo) ──
    const clearCanvas = () => {
        canvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);
        localStrokesRef.current = []; redoStackRef.current = [];
        socket?.emit("clear_canvas", roomId);
    };

    const handleUndo = () => {
        if (localStrokesRef.current.length === 0) return;
        const lastStroke = localStrokesRef.current.pop()!;
        redoStackRef.current.push(lastStroke);
        
        canvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);
        socket?.emit("clear_canvas", roomId);

        localStrokesRef.current.forEach(stroke => {
            stroke.forEach(event => {
                executeDrawEvent(event, false); 
                socket?.emit("draw_event", { roomId, ...event }); 
            });
        });
    };

    const handleRedo = () => {
        if (redoStackRef.current.length === 0) return;
        const strokeToRedo = redoStackRef.current.pop()!;
        localStrokesRef.current.push(strokeToRedo);

        strokeToRedo.forEach(event => {
            executeDrawEvent(event, false);
            socket?.emit("draw_event", { roomId, ...event });
        });
    };

    return (
        <div className="flex flex-col items-center w-full gap-3 h-full">
            
            {/* Toolbar Menu */}
            <div className="flex flex-wrap items-center justify-between w-full p-3 bg-gray-100 rounded-xl shadow-md gap-4 border border-gray-200 z-30">
                
                {/* Color Palette */}
                <div className="flex gap-2 p-2 bg-white rounded-lg shadow-inner">
                    {COLORS.map((c) => (
                        <div
                            key={c}
                            onClick={() => setColor(c)}
                            className={`w-7 h-7 rounded cursor-pointer border-2 transition-transform hover:scale-110 ${
                                color === c && c !== "#FFFFFF" ? "border-blue-500 scale-110 shadow-lg" : "border-gray-200"
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>

                {/* Brush Settings */}
                <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Brush Size</label>
                    <input type="range" min="2" max="40" value={lineWidth} onChange={(e) => setLineWidth(parseInt(e.target.value))} className="w-24 cursor-pointer accent-indigo-600" />
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-white border border-gray-200 rounded-full shadow-sm w-44">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        airDrawStatus === "Drawing..." ? "bg-green-500 animate-pulse" :
                        airDrawStatus === "Erasing..." ? "bg-pink-500 animate-pulse" :
                        airDrawStatus === "Hold Fist to Clear..." ? "bg-red-600 animate-bounce" :
                        airDrawStatus === "Hovering" ? "bg-yellow-400" :
                        airDrawStatus === "Camera Off" ? "bg-gray-400" : "bg-red-500"
                    }`} />
                    <span className="truncate">{airDrawStatus}</span>
                </div>

                {/* Drawing Actions (Undo/Redo/Clear) */}
                <div className="flex gap-2 border-l-2 pl-4 border-gray-300">
                    <button onClick={handleUndo} className="p-2 bg-white hover:bg-gray-200 text-gray-700 rounded-lg shadow-sm border border-gray-300 transition-colors" title="Undo"><Undo size={20}/></button>
                    <button onClick={handleRedo} className="p-2 bg-white hover:bg-gray-200 text-gray-700 rounded-lg shadow-sm border border-gray-300 transition-colors" title="Redo"><Redo size={20}/></button>
                    <button onClick={clearCanvas} className="p-2 bg-red-100 hover:bg-red-500 hover:text-white text-red-600 rounded-lg shadow-sm border border-red-200 transition-colors" title="Clear"><Trash2 size={20}/></button>
                </div>

                {/* Camera Toggle */}
                <button
                    onClick={toggleAirDraw}
                    disabled={!isCamReady}
                    className={`px-4 py-2 font-black text-white rounded-lg shadow-md transition-all w-36 ${
                        !isCamReady ? "bg-gray-400 cursor-not-allowed" : 
                        webcamRunningRef.current ? "bg-gray-800 hover:bg-black" : "bg-indigo-600 hover:bg-indigo-700"
                    }`}
                >
                    {!isCamReady ? "Loading AI..." : webcamRunningRef.current ? "Stop Camera" : "Start Camera"}
                </button>
            </div>

            {/* Main Canvas Area */}
            <div className="relative w-full flex-grow border-4 box-border border-gray-800 rounded-2xl overflow-hidden shadow-2xl bg-white flex justify-center items-center">
                
                {/* Background Camera Layer */}
                <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover -scale-x-100 opacity-20 filter grayscale" />
                
                {/* Drawing Layers */}
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                <canvas ref={cursorCanvasRef} className="absolute inset-0 w-full h-full object-contain touch-none cursor-crosshair" />
            </div>

            {/* Instructions updated for the new Erase gesture */}
            <div className="flex gap-6 text-xs text-gray-500 font-bold uppercase tracking-widest">
                <span>☝️ Point/Left-Click = Draw</span>
                <span>🤟 3 Fingers/Right-Click = Erase</span>
                <span>✌️ 2 Fingers = Hover</span>
                <span>✊ Hold Fist = Clear</span>
            </div>
        </div>
    );
};

export default Canvas;