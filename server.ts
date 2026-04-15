import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { createServer as createViteServer } from "vite";

// Bot Logic Imports
import { FarazGoldEngine } from "./src/server/engine.ts";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Prevent process crash from unhandled errors
  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  });

  const engine = new FarazGoldEngine();
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: 'INIT', data: engine.getState() }));

    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'UPDATE', data: engine.getState() }));
      }
    }, 1000);

    ws.on("message", (message) => {
      try {
        const command = JSON.parse(message.toString());
        if (command.type === 'START_RECORDING') engine.startRecording();
        else if (command.type === 'STOP_RECORDING') engine.stopRecording();
        else if (command.type === 'SET_TIMEFRAME') engine.setTimeframe(command.timeframe);
      } catch (e) {}
    });

    ws.on("close", () => clearInterval(interval));
  });

  app.post("/api/auth/set-refresh-token", async (req, res) => {
    const { refreshToken, type } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

    try {
      engine.refreshToken = refreshToken;
      process.env.FARAZGOLD_BASEURL = type === 'real' ? 'https://farazgold.com' : 'https://demo.farazgold.com';
      process.env.FARAZGOLD_WS_URL = type === 'real' ? 'wss://farazgold.com/ws/' : 'wss://demo.farazgold.com/ws/';

      const success = await engine.refreshAuthToken();
      if (success) {
        (engine as any).connectWS();
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Invalid refresh token' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    try {
      // Clean up any leftover PostCSS/Tailwind configs that might cause Vite to fail
      const fs = await import('fs');
      ['postcss.config.js', 'tailwind.config.js', 'postcss.config.cjs', 'tailwind.config.cjs'].forEach(file => {
        const p = path.join(process.cwd(), file);
        if (fs.existsSync(p)) {
          console.log(`[Server] Removing problematic config: ${file}`);
          fs.unlinkSync(p);
        }
      });

      const vite = await createViteServer({ 
        server: { middlewareMode: true }, 
        appType: "spa",
        logLevel: 'info'
      });
      app.use(vite.middlewares);
      console.log("[Server] Vite middleware initialized");
    } catch (error) {
      console.error("[Server] Failed to initialize Vite:", error);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} [v1.1]`);
    engine.start();
  });
}

startServer();
