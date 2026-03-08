// import React, { useEffect, useRef, useState } from "react";
// import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// // ==========================================
// // THE ONE EURO FILTER CLASS
// // ==========================================
// class OneEuroFilter {
//     minCutoff: number;
//     beta: number;
//     dCutoff: number;
//     xCurr: number | null;
//     dxCurr: number;
//     tCurr: number;

//     constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
//         this.minCutoff = minCutoff;
//         this.beta = beta;
//         this.dCutoff = dCutoff;
//         this.xCurr = null;
//         this.dxCurr = 0;
//         this.tCurr = 0;
//     }

//     alpha(t: number, cutoff: number) {
//         const tau = 1.0 / (2 * Math.PI * cutoff);
//         return 1.0 / (1.0 + tau / t);
//     }

//     filter(t: number, x: number) {
//         if (this.xCurr === null) {
//             this.xCurr = x;
//             this.tCurr = t;
//             return x;
//         }

//         const dt = t - this.tCurr;
//         if (dt <= 0) return this.xCurr;

//         const alphaD = this.alpha(dt, this.dCutoff);
//         const dx = (x - this.xCurr) / dt;
//         this.dxCurr = this.dxCurr + alphaD * (dx - this.dxCurr);

//         const cutoff = this.minCutoff + this.beta * Math.abs(this.dxCurr);
//         const alpha = this.alpha(dt, cutoff);

//         this.xCurr = this.xCurr + alpha * (x - this.xCurr);
//         this.tCurr = t;

//         return this.xCurr;
//     }

//     reset() {
//         this.xCurr = null;
//         this.dxCurr = 0;
//         this.tCurr = 0;
//     }
// }

// // ==========================================
// // APP CONSTANTS & SETTINGS
// // ==========================================
// const COLORS = [
//     "#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00",
//     "#FF00FF", "#00FFFF", "#FFA500", "#800080", "#FFFFFF"
// ];

// // 1€ Filter Tuning (Anti-Zigzag)
// const MIN_CUTOFF = 0.5;   // Base smoothing
// const BETA       = 0.001; // Velocity compensation (kept tiny to prevent spikes)

// const PINCH_ON  = 0.05;
// const PINCH_OFF = 0.08;

// const Canvas = () => {
//     const [color, setColor] = useState<string>("#000000");
//     const [lineWidth, setLineWidth] = useState<number>(5);
//     const [isCamReady, setIsCamReady] = useState<boolean>(false);
//     const [airDrawStatus, setAirDrawStatus] = useState<string>("Camera Off");

//     const colorRef = useRef(color);
//     const lineWidthRef = useRef(lineWidth);

//     const canvasRef = useRef<HTMLCanvasElement | null>(null);
//     const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null);
//     const videoRef = useRef<HTMLVideoElement | null>(null);

//     const handLandmarkerRef = useRef<HandLandmarker | null>(null);
//     const webcamRunningRef = useRef<boolean>(false);
//     const animationFrameIdRef = useRef<number | null>(null);

//     // Filters
//     const filterXRef = useRef(new OneEuroFilter(MIN_CUTOFF, BETA));
//     const filterYRef = useRef(new OneEuroFilter(MIN_CUTOFF, BETA));

//     // Memory Refs for Drawing & Frame Checking
//     const lastRawPosRef = useRef<{ x: number; y: number } | null>(null);
//     const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
//     const prevPosRef = useRef<{ x: number; y: number } | null>(null);
//     const lastMidPointRef = useRef<{ x: number; y: number } | null>(null);

//     const isDrawingRef = useRef<boolean>(false);
//     const statusRef = useRef<string>("Camera Off");

//     useEffect(() => {
//         colorRef.current = color;
//         lineWidthRef.current = lineWidth;
//     }, [color, lineWidth]);

//     // 1. Initialize AI
//     useEffect(() => {
//         async function createHandLandmarker() {
//             try {
//                 const vision = await FilesetResolver.forVisionTasks(
//                     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
//                 );
//                 handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
//                     baseOptions: {
//                         modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
//                         delegate: "GPU",
//                     },
//                     runningMode: "VIDEO",
//                     numHands: 1,
//                     minTrackingConfidence:0.6
//                 });
//                 setIsCamReady(true);
//             } catch (error) {
//                 console.error("AI load error:", error);
//             }
//         }
//         createHandLandmarker();
//         return () => stopCamera();
//     }, []);

//     // 2. Standard Mouse Drawing
//     useEffect(() => {
//         const canvas = canvasRef.current;
//         const ctx = canvas?.getContext("2d");
//         if (!canvas || !ctx) return;

//         let isMouseDrawing = false;
//         const onDown = (e: MouseEvent) => {
//             isMouseDrawing = true;
//             ctx.beginPath();
//             ctx.moveTo(e.offsetX, e.offsetY);
//             ctx.strokeStyle = colorRef.current;
//             ctx.lineWidth = lineWidthRef.current;
//             ctx.lineCap = "round";
//             ctx.lineJoin = "round";
//         };
//         const onMove = (e: MouseEvent) => {
//             if (!isMouseDrawing) return;
//             ctx.lineTo(e.offsetX, e.offsetY);
//             ctx.stroke();
//         };
//         const onUp = () => { isMouseDrawing = false; ctx.closePath(); };

//         const top = cursorCanvasRef.current;
//         if (top) {
//             top.addEventListener("mousedown", onDown);
//             top.addEventListener("mousemove", onMove);
//             top.addEventListener("mouseup", onUp);
//             top.addEventListener("mouseleave", onUp);
//         }
//         return () => {
//             if (top) {
//                 top.removeEventListener("mousedown", onDown);
//                 top.removeEventListener("mousemove", onMove);
//                 top.removeEventListener("mouseup", onUp);
//                 top.removeEventListener("mouseleave", onUp);
//             }
//         };
//     }, [color, lineWidth]);

//     const updateStatus = (s: string) => {
//         if (statusRef.current !== s) { statusRef.current = s; setAirDrawStatus(s); }
//     };

//     const resetFiltersAndMemory = () => {
//         isDrawingRef.current = false;
//         prevPosRef.current = null;
//         lastMidPointRef.current = null;
//         lastRawPosRef.current = null;
//         smoothedPosRef.current = null;

//         filterXRef.current.reset();
//         filterYRef.current.reset();
//     }

//     const stopCamera = () => {
//         webcamRunningRef.current = false;
//         if (animationFrameIdRef.current) {
//             cancelAnimationFrame(animationFrameIdRef.current);
//             animationFrameIdRef.current = null;
//         }
//         if (videoRef.current?.srcObject) {
//             (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
//             videoRef.current.srcObject = null;
//         }
//         cursorCanvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);

//         resetFiltersAndMemory();
//         updateStatus("Camera Off");
//     };

//     const toggleAirDraw = async () => {
//         if (!handLandmarkerRef.current) return;
//         if (webcamRunningRef.current) { stopCamera(); return; }

//         webcamRunningRef.current = true;
//         updateStatus("Starting Camera...");
//         try {
//             const stream = await navigator.mediaDevices.getUserMedia({
//                 video: { width: 1280, height: 720 }
//             });
//             if (videoRef.current) {
//                 videoRef.current.srcObject = stream;
//                 videoRef.current.onloadeddata = () => {
//                     videoRef.current?.play();
//                     predictWebcam();
//                 };
//             }
//         } catch {
//             updateStatus("Camera Access Denied");
//             webcamRunningRef.current = false;
//         }
//     };

//     const predictWebcam = () => {
//         const video = videoRef.current;
//         const canvas = canvasRef.current;
//         const cursorCanvas = cursorCanvasRef.current;
//         if (!canvas || !cursorCanvas || !video || !handLandmarkerRef.current) return;

//         if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
//             canvas.width = canvas.offsetWidth;
//             canvas.height = canvas.offsetHeight;
//             cursorCanvas.width = cursorCanvas.offsetWidth;
//             cursorCanvas.height = cursorCanvas.offsetHeight;
//         }

//         const ctx = canvas.getContext("2d");
//         const cursorCtx = cursorCanvas.getContext("2d");
//         if (!ctx || !cursorCtx) return;

//         cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

//         if (video.readyState >= 2) {
//             const nowMs = performance.now();
//             const timeSeconds = nowMs / 1000.0;

//             const results = handLandmarkerRef.current.detectForVideo(video, nowMs);

//             if (results.landmarks?.length > 0) {
//                 const hand = results.landmarks[0];
//                 const thumbTip = hand[4];
//                 const indexTip = hand[8];

//                 // 1. PINCH HYSTERESIS
//                 const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
//                 const wasDrawing = isDrawingRef.current;

//                 if (!wasDrawing && pinchDist < PINCH_ON) {
//                     isDrawingRef.current = true;
//                 } else if (wasDrawing && pinchDist > PINCH_OFF) {
//                     isDrawingRef.current = false;
//                     prevPosRef.current = null;
//                     lastMidPointRef.current = null;
//                 }

//                 // 2. RAW POSITION
//                 const rawX = (1 - indexTip.x) * canvas.width;
//                 const rawY = indexTip.y * canvas.height;

//                 // 3. DUPLICATE FRAME CHECK (The Anti-Zigzag Guard)
//                 const lastRaw = lastRawPosRef.current;
//                 if (lastRaw && Math.abs(lastRaw.x - rawX) < 0.1 && Math.abs(lastRaw.y - rawY) < 0.1) {
//                     // Frame hasn't updated yet. Draw cursor at last known smoothed position and wait.
//                     if (smoothedPosRef.current) {
//                         cursorCtx.beginPath();
//                         cursorCtx.arc(smoothedPosRef.current.x, smoothedPosRef.current.y, lineWidthRef.current / 2 + 2, 0, 2 * Math.PI);
//                         cursorCtx.fillStyle = isDrawingRef.current ? colorRef.current : "rgba(100, 100, 100, 0.4)";
//                         cursorCtx.fill();
//                         cursorCtx.strokeStyle = "white";
//                         cursorCtx.lineWidth = 2;
//                         cursorCtx.stroke();
//                     }
//                     if (webcamRunningRef.current) {
//                         animationFrameIdRef.current = requestAnimationFrame(predictWebcam);
//                     }
//                     return;
//                 }
//                 lastRawPosRef.current = { x: rawX, y: rawY };

//                 // 4. ONE EURO FILTERING
//                 const sX = filterXRef.current.filter(timeSeconds, rawX);
//                 const sY = filterYRef.current.filter(timeSeconds, rawY);
//                 const currPos = { x: sX, y: sY };

//                 // Save this so the duplicate frame checker can use it
//                 smoothedPosRef.current = currPos;

//                 // 5. DRAW THE HOVER CURSOR
//                 cursorCtx.beginPath();
//                 cursorCtx.arc(currPos.x, currPos.y, lineWidthRef.current / 2 + 2, 0, 2 * Math.PI);
//                 cursorCtx.fillStyle = isDrawingRef.current ? colorRef.current : "rgba(100, 100, 100, 0.4)";
//                 cursorCtx.fill();
//                 cursorCtx.strokeStyle = "white";
//                 cursorCtx.lineWidth = 2;
//                 cursorCtx.stroke();

//                 // 6. DRAW THE INK (Quadratic Curve)
//                 if (isDrawingRef.current) {
//                     updateStatus("Drawing...");

//                     if (!prevPosRef.current || !lastMidPointRef.current) {
//                         prevPosRef.current = { ...currPos };
//                         lastMidPointRef.current = { ...currPos };
//                     } else {
//                         const prev = prevPosRef.current;

//                         // Anti-Micro Jitter: Don't draw if the hand moved less than 1.5 pixels
//                         const distMoved = Math.hypot(currPos.x - prev.x, currPos.y - prev.y);

//                         if (distMoved > 1.5) {
//                             const midX = (prev.x + currPos.x) / 2;
//                             const midY = (prev.y + currPos.y) / 2;

//                             ctx.beginPath();
//                             ctx.moveTo(lastMidPointRef.current.x, lastMidPointRef.current.y);
//                             ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);

//                             ctx.strokeStyle = colorRef.current;
//                             ctx.lineWidth = lineWidthRef.current;
//                             ctx.lineCap = "round";
//                             ctx.lineJoin = "round";
//                             ctx.stroke();

//                             prevPosRef.current = { ...currPos };
//                             lastMidPointRef.current = { x: midX, y: midY };
//                         }
//                     }
//                 } else {
//                     updateStatus("Hovering");
//                 }
//             } else {
//                 updateStatus("No Hands Detected");
//                 resetFiltersAndMemory();
//             }
//         }

//         if (webcamRunningRef.current) {
//             animationFrameIdRef.current = requestAnimationFrame(predictWebcam);
//         }
//     };

//     const clearCanvas = () => {
//         canvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);
//     };

//     return (
//         <div className="flex flex-col items-center w-full gap-4">
//             {/* Toolbar */}
//             <div className="flex flex-wrap items-center justify-between w-full p-4 bg-gray-100 rounded-lg shadow-md gap-4">
//                 <div className="flex gap-2 p-2 bg-white rounded-lg shadow-inner">
//                     {COLORS.map((c) => (
//                         <div
//                             key={c}
//                             onClick={() => setColor(c)}
//                             className={`w-8 h-8 rounded cursor-pointer border-2 transition-transform hover:scale-110 ${
//                                 color === c ? "border-blue-500 scale-110 shadow-lg" : "border-gray-300"
//                             }`}
//                             style={{ backgroundColor: c }}
//                             title={c === "#FFFFFF" ? "Eraser" : c}
//                         />
//                     ))}
//                 </div>

//                 <div className="flex flex-col">
//                     <label className="text-sm font-bold text-gray-700">Brush Size: {lineWidth}px</label>
//                     <input
//                         type="range" min="2" max="40" value={lineWidth}
//                         onChange={(e) => setLineWidth(parseInt(e.target.value))}
//                         className="w-32 cursor-pointer accent-blue-600"
//                     />
//                 </div>

//                 <div className="flex items-center gap-4">
//                     <div className="flex items-center gap-2 text-sm font-semibold px-3 py-1 bg-white border border-gray-300 rounded-full w-48 shadow-sm">
//                         <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
//                             airDrawStatus === "Drawing..."   ? "bg-green-500 animate-pulse" :
//                             airDrawStatus === "Hovering"     ? "bg-yellow-400" :
//                             airDrawStatus === "Camera Off"   ? "bg-gray-400" : "bg-red-500"
//                         }`} />
//                         <span className="truncate">{airDrawStatus}</span>
//                     </div>

//                     <button onClick={clearCanvas} className="px-4 py-2 bg-red-500 text-white font-bold rounded shadow hover:bg-red-600">
//                         Clear
//                     </button>

//                     <button
//                         onClick={toggleAirDraw}
//                         disabled={!isCamReady}
//                         className={`px-4 py-2 font-bold text-white rounded shadow w-40 ${
//                             !isCamReady              ? "bg-gray-400 cursor-not-allowed" :
//                             webcamRunningRef.current ? "bg-gray-800 hover:bg-gray-900" :
//                                                        "bg-blue-600 hover:bg-blue-700"
//                         }`}
//                     >
//                         {!isCamReady ? "Loading AI..." : webcamRunningRef.current ? "Stop Camera" : "Start Camera"}
//                     </button>
//                 </div>
//             </div>

//             {/* Canvas / Tracing Paper Area */}
//             <div className="relative w-full max-w-5xl aspect-video border-4 box-border border-gray-800 rounded-xl overflow-hidden shadow-2xl bg-black">
//                 <video ref={videoRef} autoPlay playsInline className="absolute bg-white inset-0 w-full h-full object-fill -scale-x-100" />
//                 <div className="absolute inset-0 bg-white/70 pointer-events-none" />
//                 <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
//                 <canvas ref={cursorCanvasRef} className="absolute inset-0 w-full h-full cursor-crosshair touch-none" />
//             </div>

//             <p className="text-sm text-gray-500 font-medium">
//                 Pinch thumb and index finger together to draw over the video feed.
//             </p>
//         </div>
//     );
// };

// export default Canvas;

// import React, { useEffect, useRef, useState } from "react";
// import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// // ==========================================
// // THE ONE EURO FILTER CLASS
// // ==========================================
// class OneEuroFilter {
//     minCutoff: number;
//     beta: number;
//     dCutoff: number;
//     xCurr: number | null;
//     dxCurr: number;
//     tCurr: number;

//     constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
//         this.minCutoff = minCutoff;
//         this.beta = beta;
//         this.dCutoff = dCutoff;
//         this.xCurr = null;
//         this.dxCurr = 0;
//         this.tCurr = 0;
//     }

//     alpha(t: number, cutoff: number) {
//         const tau = 1.0 / (2 * Math.PI * cutoff);
//         return 1.0 / (1.0 + tau / t);
//     }

//     filter(t: number, x: number) {
//         if (this.xCurr === null) {
//             this.xCurr = x;
//             this.tCurr = t;
//             return x;
//         }

//         const dt = t - this.tCurr;
//         if (dt <= 0) return this.xCurr;

//         const alphaD = this.alpha(dt, this.dCutoff);
//         const dx = (x - this.xCurr) / dt;
//         this.dxCurr = this.dxCurr + alphaD * (dx - this.dxCurr);

//         const cutoff = this.minCutoff + this.beta * Math.abs(this.dxCurr);
//         const alpha = this.alpha(dt, cutoff);

//         this.xCurr = this.xCurr + alpha * (x - this.xCurr);
//         this.tCurr = t;

//         return this.xCurr;
//     }

//     reset() {
//         this.xCurr = null;
//         this.dxCurr = 0;
//         this.tCurr = 0;
//     }
// }

// const COLORS = [
//     "#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00",
//     "#FF00FF", "#00FFFF", "#FFA500", "#800080", "#FFFFFF"
// ];

// // 1€ Filter Tuning
// const MIN_CUTOFF = 1.0;
// const BETA       = 0.007;

// const Canvas = () => {
//     const [color, setColor] = useState<string>("#000000");
//     const [lineWidth, setLineWidth] = useState<number>(5);
//     const [isCamReady, setIsCamReady] = useState<boolean>(false);
//     const [airDrawStatus, setAirDrawStatus] = useState<string>("Camera Off");

//     const colorRef = useRef(color);
//     const lineWidthRef = useRef(lineWidth);

//     const canvasRef = useRef<HTMLCanvasElement | null>(null);
//     const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null);
//     const videoRef = useRef<HTMLVideoElement | null>(null);

//     const handLandmarkerRef = useRef<HandLandmarker | null>(null);
//     const webcamRunningRef = useRef<boolean>(false);
//     const animationFrameIdRef = useRef<number | null>(null);

//     const filterXRef = useRef(new OneEuroFilter(MIN_CUTOFF, BETA));
//     const filterYRef = useRef(new OneEuroFilter(MIN_CUTOFF, BETA));

//     const lastRawPosRef = useRef<{ x: number; y: number } | null>(null);
//     const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
//     const prevPosRef = useRef<{ x: number; y: number } | null>(null);
//     const lastMidPointRef = useRef<{ x: number; y: number } | null>(null);

//     const isDrawingRef = useRef<boolean>(false);
//     const statusRef = useRef<string>("Camera Off");

//     useEffect(() => {
//         colorRef.current = color;
//         lineWidthRef.current = lineWidth;
//     }, [color, lineWidth]);

//     useEffect(() => {
//         async function createHandLandmarker() {
//             try {
//                 const vision = await FilesetResolver.forVisionTasks(
//                     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
//                 );
//                 handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
//                     baseOptions: {
//                         modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
//                         delegate: "GPU",
//                     },
//                     runningMode: "VIDEO",
//                     numHands: 2,
//                     minHandDetectionConfidence:0.7,
//                     minHandPresenceConfidence:0.6,
//                     minTrackingConfidence: 0.6
//                 });
//                 setIsCamReady(true);
//             } catch (error) {
//                 console.error("AI load error:", error);
//             }
//         }
//         createHandLandmarker();
//         return () => stopCamera();
//     }, []);

//     useEffect(() => {
//         const canvas = canvasRef.current;
//         const ctx = canvas?.getContext("2d");
//         if (!canvas || !ctx) return;

//         let isMouseDrawing = false;
//         const onDown = (e: MouseEvent) => {
//             isMouseDrawing = true;
//             ctx.beginPath();
//             ctx.moveTo(e.offsetX, e.offsetY);
//             ctx.strokeStyle = colorRef.current;
//             ctx.lineWidth = lineWidthRef.current;
//             ctx.lineCap = "round";
//             ctx.lineJoin = "round";
//         };
//         const onMove = (e: MouseEvent) => {
//             if (!isMouseDrawing) return;
//             ctx.lineTo(e.offsetX, e.offsetY);
//             ctx.stroke();
//         };
//         const onUp = () => { isMouseDrawing = false; ctx.closePath(); };

//         const top = cursorCanvasRef.current;
//         if (top) {
//             top.addEventListener("mousedown", onDown);
//             top.addEventListener("mousemove", onMove);
//             top.addEventListener("mouseup", onUp);
//             top.addEventListener("mouseleave", onUp);
//         }
//         return () => {
//             if (top) {
//                 top.removeEventListener("mousedown", onDown);
//                 top.removeEventListener("mousemove", onMove);
//                 top.removeEventListener("mouseup", onUp);
//                 top.removeEventListener("mouseleave", onUp);
//             }
//         };
//     }, [color, lineWidth]);

//     const updateStatus = (s: string) => {
//         if (statusRef.current !== s) { statusRef.current = s; setAirDrawStatus(s); }
//     };

//     const resetFiltersAndMemory = () => {
//         isDrawingRef.current = false;
//         prevPosRef.current = null;
//         lastMidPointRef.current = null;
//         lastRawPosRef.current = null;
//         smoothedPosRef.current = null;

//         filterXRef.current.reset();
//         filterYRef.current.reset();
//     }

//     const stopCamera = () => {
//         webcamRunningRef.current = false;
//         if (animationFrameIdRef.current) {
//             cancelAnimationFrame(animationFrameIdRef.current);
//             animationFrameIdRef.current = null;
//         }
//         if (videoRef.current?.srcObject) {
//             (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
//             videoRef.current.srcObject = null;
//         }
//         cursorCanvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);

//         resetFiltersAndMemory();
//         updateStatus("Camera Off");
//     };

//     const toggleAirDraw = async () => {
//         if (!handLandmarkerRef.current) return;
//         if (webcamRunningRef.current) { stopCamera(); return; }

//         webcamRunningRef.current = true;
//         updateStatus("Starting Camera...");
//         try {
//             const stream = await navigator.mediaDevices.getUserMedia({
//                 video: { width: 1280, height: 720 }
//             });
//             if (videoRef.current) {
//                 videoRef.current.srcObject = stream;
//                 videoRef.current.onloadeddata = () => {
//                     videoRef.current?.play();
//                     predictWebcam();
//                 };
//             }
//         } catch {
//             updateStatus("Camera Access Denied");
//             webcamRunningRef.current = false;
//         }
//     };

//     const predictWebcam = () => {
//         const video = videoRef.current;
//         const canvas = canvasRef.current;
//         const cursorCanvas = cursorCanvasRef.current;
//         if (!canvas || !cursorCanvas || !video || !handLandmarkerRef.current) return;

//         if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
//             canvas.width = canvas.offsetWidth;
//             canvas.height = canvas.offsetHeight;
//             cursorCanvas.width = cursorCanvas.offsetWidth;
//             cursorCanvas.height = cursorCanvas.offsetHeight;
//         }

//         const ctx = canvas.getContext("2d");
//         const cursorCtx = cursorCanvas.getContext("2d");
//         if (!ctx || !cursorCtx) return;

//         cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

//         if (video.readyState >= 2) {
//             const nowMs = performance.now();
//             const timeSeconds = nowMs / 1000.0;

//             const results = handLandmarkerRef.current.detectForVideo(video, nowMs);

//             if (results.landmarks?.length > 0) {
//                 const hand = results.landmarks[0];

//                 // --- HIGH SPEED GESTURE LOGIC ---
//                 // Y=0 is the top of the video. Y=1 is the bottom.
//                 const indexTip = hand[8];
//                 const indexPip = hand[6]; // Second knuckle of index

//                 const middleTip = hand[12];
//                 const middlePip = hand[10];

//                 const ringTip = hand[16];
//                 const ringPip = hand[14];

//                 // Check if Index is pointing UP (Tip is higher than knuckle)
//                 const isIndexUp = indexTip.y < indexPip.y;

//                 // Check if Middle and Ring are curled DOWN (Tip is lower than knuckle)
//                 const isMiddleDown = middleTip.y > middlePip.y;
//                 const isRingDown = ringTip.y > ringPip.y;

//                 // The logic: Draw ONLY if pointing index up, and other fingers are curled into palm.
//                 // This prevents the AI from confusing the middle finger for the index when moving fast.
//                 if (isIndexUp && isMiddleDown && isRingDown) {
//                     if (!isDrawingRef.current) {
//                         isDrawingRef.current = true;
//                     }
//                 } else {
//                     if (isDrawingRef.current) {
//                         isDrawingRef.current = false;
//                         prevPosRef.current = null;
//                         lastMidPointRef.current = null;
//                     }
//                 }

//                 // 2. RAW POSITION (Always tracking the Index Tip)
//                 const rawX = (1 - indexTip.x) * canvas.width;
//                 const rawY = indexTip.y * canvas.height;

//                 // 3. DUPLICATE FRAME CHECK
//                 const lastRaw = lastRawPosRef.current;
//                 if (lastRaw && Math.abs(lastRaw.x - rawX) < 0.01 && Math.abs(lastRaw.y - rawY) < 0.01) {
//                     if (smoothedPosRef.current) {
//                         cursorCtx.beginPath();
//                         cursorCtx.arc(smoothedPosRef.current.x, smoothedPosRef.current.y, lineWidthRef.current / 2 + 2, 0, 2 * Math.PI);
//                         cursorCtx.fillStyle = isDrawingRef.current ? colorRef.current : "rgba(100, 100, 100, 0.4)";
//                         cursorCtx.fill();
//                         cursorCtx.strokeStyle = "white";
//                         cursorCtx.lineWidth = 2;
//                         cursorCtx.stroke();
//                     }
//                     if (webcamRunningRef.current) {
//                         animationFrameIdRef.current = requestAnimationFrame(predictWebcam);
//                     }
//                     return;
//                 }
//                 lastRawPosRef.current = { x: rawX, y: rawY };

//                 // 4. ONE EURO FILTERING
//                 const sX = filterXRef.current.filter(timeSeconds, rawX);
//                 const sY = filterYRef.current.filter(timeSeconds, rawY);
//                 const currPos = { x: sX, y: sY };

//                 smoothedPosRef.current = currPos;

//                 // 5. DRAW THE HOVER CURSOR
//                 cursorCtx.beginPath();
//                 cursorCtx.arc(currPos.x, currPos.y, lineWidthRef.current / 2 + 2, 0, 2 * Math.PI);
//                 cursorCtx.fillStyle = isDrawingRef.current ? colorRef.current : "rgba(100, 100, 100, 0.4)";
//                 cursorCtx.fill();
//                 cursorCtx.strokeStyle = "white";
//                 cursorCtx.lineWidth = 2;
//                 cursorCtx.stroke();

//                 // 6. DRAW THE INK
//                 if (isDrawingRef.current) {
//                     updateStatus("Drawing...");

//                     if (!prevPosRef.current || !lastMidPointRef.current) {
//                         prevPosRef.current = { ...currPos };
//                         lastMidPointRef.current = { ...currPos };
//                     } else {
//                         const prev = prevPosRef.current;

//                         const distMoved = Math.hypot(currPos.x - prev.x, currPos.y - prev.y);

//                         if (distMoved > 0.5) {
//                             const midX = (prev.x + currPos.x) / 2;
//                             const midY = (prev.y + currPos.y) / 2;

//                             ctx.beginPath();
//                             ctx.moveTo(lastMidPointRef.current.x, lastMidPointRef.current.y);
//                             ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);

//                             ctx.strokeStyle = colorRef.current;
//                             ctx.lineWidth = lineWidthRef.current;
//                             ctx.lineCap = "round";
//                             ctx.lineJoin = "round";
//                             ctx.stroke();

//                             prevPosRef.current = { ...currPos };
//                             lastMidPointRef.current = { x: midX, y: midY };
//                         }
//                     }
//                 } else {
//                     updateStatus("Hovering");
//                 }
//             } else {
//                 updateStatus("No Hands Detected");
//                 resetFiltersAndMemory();
//             }
//         }

//         if (webcamRunningRef.current) {
//             animationFrameIdRef.current = requestAnimationFrame(predictWebcam);
//         }
//     };

//     const clearCanvas = () => {
//         canvasRef.current?.getContext("2d")?.clearRect(0, 0, 9999, 9999);
//     };

//     return (
//         <div className="flex flex-col items-center w-full gap-4">
//             {/* Toolbar */}
//             <div className="flex flex-wrap items-center justify-between w-full p-4 bg-gray-100 rounded-lg shadow-md gap-4">
//                 <div className="flex gap-2 p-2 bg-white rounded-lg shadow-inner">
//                     {COLORS.map((c) => (
//                         <div
//                             key={c}
//                             onClick={() => setColor(c)}
//                             className={`w-8 h-8 rounded cursor-pointer border-2 transition-transform hover:scale-110 ${
//                                 color === c ? "border-blue-500 scale-110 shadow-lg" : "border-gray-300"
//                             }`}
//                             style={{ backgroundColor: c }}
//                             title={c === "#FFFFFF" ? "Eraser" : c}
//                         />
//                     ))}
//                 </div>

//                 <div className="flex flex-col">
//                     <label className="text-sm font-bold text-gray-700">Brush Size: {lineWidth}px</label>
//                     <input
//                         type="range" min="2" max="40" value={lineWidth}
//                         onChange={(e) => setLineWidth(parseInt(e.target.value))}
//                         className="w-32 cursor-pointer accent-blue-600"
//                     />
//                 </div>

//                 <div className="flex items-center gap-4">
//                     <div className="flex items-center gap-2 text-sm font-semibold px-3 py-1 bg-white border border-gray-300 rounded-full w-48 shadow-sm">
//                         <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
//                             airDrawStatus === "Drawing..."   ? "bg-green-500 animate-pulse" :
//                             airDrawStatus === "Hovering"     ? "bg-yellow-400" :
//                             airDrawStatus === "Camera Off"   ? "bg-gray-400" : "bg-red-500"
//                         }`} />
//                         <span className="truncate">{airDrawStatus}</span>
//                     </div>

//                     <button onClick={clearCanvas} className="px-4 py-2 bg-red-500 text-white font-bold rounded shadow hover:bg-red-600">
//                         Clear
//                     </button>

//                     <button
//                         onClick={toggleAirDraw}
//                         disabled={!isCamReady}
//                         className={`px-4 py-2 font-bold text-white rounded shadow w-40 ${
//                             !isCamReady              ? "bg-gray-400 cursor-not-allowed" :
//                             webcamRunningRef.current ? "bg-gray-800 hover:bg-gray-900" :
//                                                        "bg-blue-600 hover:bg-blue-700"
//                         }`}
//                     >
//                         {!isCamReady ? "Loading AI..." : webcamRunningRef.current ? "Stop Camera" : "Start Camera"}
//                     </button>
//                 </div>
//             </div>

//             {/* Canvas / Tracing Paper Area */}
//             <div className="relative w-full max-w-5xl aspect-video border-4 box-border border-gray-800 rounded-xl overflow-hidden shadow-2xl bg-black">
//                 <video ref={videoRef} autoPlay playsInline className="absolute bg-white inset-0 w-full h-full object-fill -scale-x-100" />
//                 <div className="absolute inset-0 bg-white/70 pointer-events-none" />
//                 <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
//                 <canvas ref={cursorCanvasRef} className="absolute inset-0 w-full h-full cursor-crosshair touch-none" />
//             </div>

//             <p className="text-sm text-gray-500 font-medium">
//                 Point index finger UP and curl other fingers DOWN to draw. Open hand to hover.
//             </p>
//         </div>
//     );
// };

// export default Canvas;

import React, { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// ==========================================
// ONE EURO FILTER
// ==========================================
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

// TUNED: Higher BETA = filter opens up during fast motion = less lag
const MIN_CUTOFF = 1.0;
const BETA = 0.008;

// Velocity prediction: nudges cursor ahead of movement direction
// Tune between 0.2–0.5. Higher = more aggressive prediction.
const PREDICTION_FACTOR = 0.3;

// Min pixel movement to commit a stroke segment (prevents micro-jitter)
const JITTER_THRESHOLD = 0.5;

// ==========================================
// COMPONENT
// ==========================================
const Canvas = () => {
	const [color, setColor] = useState<string>("#000000");
	const [lineWidth, setLineWidth] = useState<number>(5);
	const [isCamReady, setIsCamReady] = useState<boolean>(false);
	const [airDrawStatus, setAirDrawStatus] = useState<string>("Camera Off");

	const colorRef = useRef(color);
	const lineWidthRef = useRef(lineWidth);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);

	const handLandmarkerRef = useRef<HandLandmarker | null>(null);
	const webcamRunningRef = useRef<boolean>(false);
	// requestVideoFrameCallback handle (replaces animationFrameId)
	const rvfcHandleRef = useRef<number | null>(null);

	// 1€ filters for X and Y
	const filterXRef = useRef(new OneEuroFilter(MIN_CUTOFF, BETA));
	const filterYRef = useRef(new OneEuroFilter(MIN_CUTOFF, BETA));

	// Drawing state
	const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
	const prevPosRef = useRef<{ x: number; y: number } | null>(null);
	const lastMidPointRef = useRef<{ x: number; y: number } | null>(null);
	const isDrawingRef = useRef<boolean>(false);
	const statusRef = useRef<string>("Camera Off");

	// Batched stroke points buffer (DrawingUtils-style single stroke() per frame)
	const pointsBufferRef = useRef<{ x: number; y: number }[]>([]);

	// Wrist velocity for predictive cursor
	const lastWristRef = useRef<{ x: number; y: number } | null>(null);
	const wristVelRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

	useEffect(() => {
		colorRef.current = color;
		lineWidthRef.current = lineWidth;
	}, [color, lineWidth]);

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
							modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
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
		};
		const onMove = (e: MouseEvent) => {
			if (!isMouseDrawing) return;
			ctx.lineTo(e.offsetX, e.offsetY);
			ctx.stroke();
		};
		const onUp = () => {
			isMouseDrawing = false;
			ctx.closePath();
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
	}, [color, lineWidth]);

	// ── Helpers ──────────────────────────────────────────────────────────────
	const updateStatus = (s: string) => {
		if (statusRef.current !== s) {
			statusRef.current = s;
			setAirDrawStatus(s);
		}
	};

	const resetFiltersAndMemory = () => {
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

		// Cancel the rVFC handle
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
					scheduleNextFrame(); // kick off rVFC loop
				};
			}
		} catch {
			updateStatus("Camera Access Denied");
			webcamRunningRef.current = false;
		}
	};

	// ── 4. requestVideoFrameCallback loop ────────────────────────────────────
	//
	//  KEY ADVANTAGE over rAF:
	//  - Fires exactly once per NEW decoded video frame → no duplicate frames
	//  - metadata.mediaTime is the frame's accurate presentation timestamp
	//  - Eliminates the entire "duplicate frame guard" logic we had before
	//
	const scheduleNextFrame = () => {
		const video = videoRef.current;
		if (!video || !webcamRunningRef.current) return;

		rvfcHandleRef.current = video.requestVideoFrameCallback(
			(now: number, metadata: VideoFrameCallbackMetadata) => {
				if (!webcamRunningRef.current) return;
				processFrame(metadata);
				scheduleNextFrame(); // reschedule for the next frame
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

		// Sync canvas resolution to CSS size
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

		// Use the frame's accurate media timestamp for the 1€ filter
		// metadata.mediaTime is in seconds — more accurate than performance.now()
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

		// ── Gesture: index pointing up, others curled ──
		const isIndexUp = indexTip.y < indexPip.y;
		const isMiddleDown = middleTip.y > middlePip.y;
		const isRingDown = ringTip.y > ringPip.y;
		const shouldDraw = isIndexUp && isMiddleDown && isRingDown;

		if (shouldDraw && !isDrawingRef.current) {
			isDrawingRef.current = true;
			pointsBufferRef.current = []; // fresh stroke
		} else if (!shouldDraw && isDrawingRef.current) {
			isDrawingRef.current = false;
			pointsBufferRef.current = [];
			prevPosRef.current = null;
			lastMidPointRef.current = null;
		}

		// ── Wrist velocity for predictive positioning ──
		const wristX = (1 - wrist.x) * canvas.width;
		const wristY = wrist.y * canvas.height;

		if (lastWristRef.current) {
			wristVelRef.current = {
				x: wristX - lastWristRef.current.x,
				y: wristY - lastWristRef.current.y,
			};
		}
		lastWristRef.current = { x: wristX, y: wristY };

		// ── Raw position of index tip (mirrored X) ──
		const rawX = (1 - indexTip.x) * canvas.width;
		const rawY = indexTip.y * canvas.height;

		// ── Velocity-based prediction: nudge ahead of wrist movement ──
		//    Reduces perceived latency by ~1-2 frames during fast strokes
		const predictedX = rawX + wristVelRef.current.x * PREDICTION_FACTOR;
		const predictedY = rawY + wristVelRef.current.y * PREDICTION_FACTOR;

		// ── 1€ filter on the predicted position ──
		const sX = filterXRef.current.filter(timeSec, predictedX);
		const sY = filterYRef.current.filter(timeSec, predictedY);
		const currPos = { x: sX, y: sY };
		smoothedPosRef.current = currPos;

		// ── Draw cursor ──
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

		// ── Ink rendering (batched, DrawingUtils-style) ──
		if (isDrawingRef.current) {
			updateStatus("Drawing...");

			pointsBufferRef.current.push({ ...currPos });

			const pts = pointsBufferRef.current;

			if (pts.length >= 2) {
				const prev = pts[pts.length - 2];
				const curr = pts[pts.length - 1];
				const distMoved = Math.hypot(curr.x - prev.x, curr.y - prev.y);

				if (distMoved > JITTER_THRESHOLD) {
					// Batch all buffered points into ONE path, stroke ONCE
					// This mirrors how DrawingUtils renders connectors —
					// never calling stroke() inside the loop.
					ctx.beginPath();
					ctx.strokeStyle = colorRef.current;
					ctx.lineWidth = lineWidthRef.current;
					ctx.lineCap = "round";
					ctx.lineJoin = "round";

					ctx.moveTo(pts[0].x, pts[0].y);
					for (let i = 1; i < pts.length - 1; i++) {
						// Chaikin midpoint smoothing (same as DrawingUtils connectors)
						const midX = (pts[i].x + pts[i + 1].x) / 2;
						const midY = (pts[i].y + pts[i + 1].y) / 2;
						ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
					}
					// Draw to the last point without closing
					ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

					ctx.stroke(); // ← single stroke() call for the whole path

					// Keep only the last point as the anchor for the next batch
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
	};

	// ── 8. Render ────────────────────────────────────────────────────────────
	return (
		<div className="flex flex-col items-center w-full gap-4">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center justify-between w-full p-4 bg-gray-100 rounded-lg shadow-md gap-4">
				{/* Color palette */}
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

				{/* Brush size */}
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

				{/* Status + buttons */}
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

			{/* Canvas area */}
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
