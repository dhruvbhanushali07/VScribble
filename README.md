# VScribble 🎨✨

**VScribble** is a real-time, multiplayer, AI-powered drawing and guessing game inspired by Skribbl.io. Instead of just using a mouse, VScribble uses your webcam and **Computer Vision** to let you draw in the air using your fingers!

## ✨ Features

### 🎮 Gameplay Mechanics
* **AI Air Drawing:** Uses Google's MediaPipe to track your hand in real-time. Draw, erase, and clear the canvas using natural hand gestures.
* **Real-Time Multiplayer:** Built with Socket.IO for blazing-fast synchronization of drawing, chatting, and game state across all clients.
* **Smart Hint System:** Automatically paces out hints based on the round timer, revealing vowels and random letters to help guessers.
* **"Close Guess" Detection:** Uses the Levenshtein Distance algorithm to privately tell players when their typo is incredibly close to the actual word.
* **Rank-Based Scoring:** The faster you guess compared to others, the more points you get. Drawers are rewarded based on how many people guess their drawing and how quickly the first guess happens.
* **Late-Joiner Sync:** If a player joins mid-round, the server sends them the entire canvas history so they instantly see the current drawing.

### 🛠️ Quality of Life & UI
* **Customizable Lobbies:** The host can adjust max players, draw time, total rounds, word options, and the number of hints.
* **Advanced Canvas Tools:** Supports Undo, Redo, Clear, brush size adjustments, and 10 colors. 
* **Mouse Fallback:** Don't want to use the camera? You can still play perfectly using a mouse (Left-click to draw, Right-click to erase).
* **Left-Handed Mode:** A dedicated toggle that flips the UI layout to make air-drawing easier for left-handed players.
* **Buttery Smooth Animations:** Uses GSAP for satisfying pop-ups, turn transitions, and a bouncy Final Podium screen.

---

## 🖐️ Air Drawing Gestures

Make sure your hand is visible to the webcam. The AI tracks your finger positions to determine your active tool:

* ☝️ **Index Finger Up:** Draw
* 🤟 **3 Fingers Up (Index, Middle, Ring):** Erase
* ✋ **Open Hand (All fingers up):** Hover / Move cursor without drawing
* ✊ **Hold Fist:** Clear the entire canvas (Hold for 1 second)

---

## 💻 Tech Stack

**Frontend:**
* React (with TypeScript)
* Tailwind CSS (Styling)
* GSAP (Animations)
* HTML5 Canvas API
* MediaPipe Tasks-Vision (Hand Tracking)
* Lucide React (Icons)

**Backend:**
* Node.js
* Express
* Socket.IO (WebSockets)

---

## 🚀 Installation & Setup

To run this project locally, you will need two terminal windows open—one for the backend server and one for the frontend client.

### Prerequisites
* Node.js (v16 or higher recommended)
* npm or yarn

### 1. Backend Setup
Navigate to the backend directory, install dependencies, and start the server:

```bash
cd backend
npm install
node index.js