import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import fs from "fs";

// Bot Logic Imports (We'll create these next)
import { FarazGoldEngine } from "./src/server/engine.ts";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  const engine = new FarazGoldEngine();
  console.log("Engine initialized");
  const wss = new WebSocketServer({ server });
  console.log("WebSocket server created");

  app.use(express.json());

  wss.on("connection", (ws) => {
    console.log("Client connected to WebSocket");
    
    // Send initial state
    ws.send(JSON.stringify({ type: 'INIT', data: engine.getState() }));

    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'UPDATE', data: engine.getState() }));
      }
    }, 1000);

    ws.on("message", (message) => {
      try {
        const command = JSON.parse(message.toString());
        if (command.type === 'START_RECORDING') {
          engine.startRecording();
        } else if (command.type === 'STOP_RECORDING') {
          engine.stopRecording();
        } else if (command.type === 'SET_TIMEFRAME') {
          console.log(`[Server] Received SET_TIMEFRAME: ${command.timeframe}`);
          engine.setTimeframe(command.timeframe);
        }
      } catch (e) {
        console.error("Error processing WS message:", e);
      }
    });

    ws.on("close", () => {
      clearInterval(interval);
      console.log("Client disconnected");
    });
  });

  // Auth Endpoints
  app.post("/api/auth/set-refresh-token", async (req, res) => {
    const { refreshToken, type } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

    try {
      engine.refreshToken = refreshToken;
      const baseUrl = type === 'real' ? 'https://farazgold.com' : 'https://demo.farazgold.com';
      process.env.FARAZGOLD_BASEURL = baseUrl;
      process.env.FARAZGOLD_WS_URL = type === 'real' ? 'wss://farazgold.com/ws/' : 'wss://demo.farazgold.com/ws/';

      const success = await engine.refreshAuthToken();
      if (success) {
        (engine as any).connectWS();
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Invalid refresh token or server error' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes
  app.get("/api/status", (req, res) => {
    res.json(engine.getState());
  });

  app.post("/api/control", (req, res) => {
    const { action } = req.body;
    if (action === 'start') engine.startRecording();
    if (action === 'stop') engine.stopRecording();
    res.json({ success: true, isRecording: engine.isRecording });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    engine.start();
  });
}

startServer();
