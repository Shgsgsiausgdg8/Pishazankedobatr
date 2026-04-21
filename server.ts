import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { createServer as createViteServer } from "vite";
// Bot Logic Imports
import { FarazGoldEngine } from "./src/server/faraz_engine.js";
import { AlphaGoldEngine } from "./src/server/alpha_engine.js";

import { BacktestEngine } from "./src/server/backtest.js";

async function startServer() {
    const app = express();
    const server = http.createServer(app);
    const PORT = 3000;

    const backtestEngine = new BacktestEngine();

    // Prevent process crash from unhandled errors
    process.on('uncaughtException', (err) => {
        console.error('[Server] Uncaught Exception:', err);
    });
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
    });

    const farazEngine = new FarazGoldEngine();
    const alphaEngine = new AlphaGoldEngine();
    
    const engines: Record<string, any> = {
        faraz: farazEngine,
        alpha: alphaEngine
    };

    const wss = new WebSocketServer({ server });

    app.use(express.json());

    wss.on("connection", (ws) => {
        let currentBroker = 'faraz';

        const sendState = (type: string) => {
            const engine = engines[currentBroker];
            if (engine && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                    type, 
                    broker: currentBroker, 
                    data: engine.getState() 
                }));
            }
        };

        sendState('INIT');
        
        const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                sendState('UPDATE');
            }
        }, 1000);

        ws.on("message", (message) => {
            try {
                const command = JSON.parse(message.toString());
                if (command.type === 'SET_BROKER') {
                    if (engines[command.broker]) {
                        currentBroker = command.broker;
                        console.log(`[Server] Switched context to broker: ${currentBroker}`);
                        sendState('INIT');
                    }
                } else if (command.type === 'RUN_BACKTEST') {
                    const engine = engines[currentBroker];
                    const state = engine.getState();
                    console.log(`[Server] Running backtest for ${currentBroker} (${command.strategyType}) with ${state.candles?.length || 0} candles`);
                    
                    if (!state.candles || state.candles.length < 60) {
                        ws.send(JSON.stringify({ 
                            type: 'BACKTEST_RESULTS', 
                            broker: currentBroker, 
                            data: { totalTrades: 0, winRate: 0, totalProfit: 0, maxDrawdown: 0, bestHour: -1, bestDay: 'N/A', trades: [], error: 'Not enough data (min 60 candles)' } 
                        }));
                    } else {
                        const results = backtestEngine.run(state.candles, state.timeframe, command.strategyType);
                        ws.send(JSON.stringify({
                            type: 'BACKTEST_RESULTS',
                            broker: currentBroker,
                            data: results
                        }));
                    }
                } else if (command.type === 'RUN_GLOBAL_BACKTEST') {
                    const engine = engines[currentBroker];
                    const state = engine.getState();
                    console.log(`[Server] Running global backtest for ${currentBroker} with ${state.candles?.length || 0} candles`);
                    
                    if (!state.candles || state.candles.length < 60) {
                        ws.send(JSON.stringify({ 
                            type: 'GLOBAL_BACKTEST_RESULTS', 
                            broker: currentBroker, 
                            data: [],
                            error: 'Not enough data (min 60 candles)'
                        }));
                    } else {
                        const results = backtestEngine.runGlobalComparison(state.candles, state.timeframe);
                        ws.send(JSON.stringify({
                            type: 'GLOBAL_BACKTEST_RESULTS',
                            broker: currentBroker,
                            data: results
                        }));
                    }
                } else {
                    const engine = engines[currentBroker];
                    if (!engine) return;
                    
                    if (command.type === 'START_RECORDING')
                        engine.startRecording();
                    else if (command.type === 'STOP_RECORDING')
                        engine.stopRecording();
                    else if (command.type === 'SET_TIMEFRAME')
                        engine.setTimeframe(command.timeframe);
                    else if (command.type === 'SET_LIVE_STRATEGY') {
                        (engine as any).liveStrategyType = command.strategy;
                        console.log(`[Server] ${currentBroker} live strategy set to ${command.strategy}`);
                    }
                }
            }
            catch (e) { }
        });

        ws.on("close", () => clearInterval(interval));
    });

    app.post("/api/auth/set-refresh-token", async (req, res) => {
        const { refreshToken, type } = req.body;
        if (!refreshToken)
            return res.status(400).json({ error: 'Token is required' });
        try {
            process.env.FARAZGOLD_BASEURL = type === 'real' ? 'https://farazgold.com' : 'https://demo.farazgold.com';
            // If it looks like an access token (starts with eyJ), set it as accessToken
            if (refreshToken.startsWith('eyJ')) {
                farazEngine.accessToken = refreshToken;
                console.log("[Server] Access token set directly.");
            }
            else {
                farazEngine.refreshToken = refreshToken;
                await farazEngine.refreshAuthToken();
            }
            farazEngine.saveSettings();
            farazEngine.connectWS();
            res.json({ success: true });
        }
        catch (error: any) {
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
        }
        catch (error) {
            console.error("[Server] Failed to initialize Vite:", error);
        }
    }
    else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT} [v1.3]`);
        farazEngine.start();
        alphaEngine.start();
    });
}

startServer();
