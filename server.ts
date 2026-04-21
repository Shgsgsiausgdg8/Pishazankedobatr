import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { FarazGoldEngine } from './src/server/faraz_engine.js';
import { AlphaGoldEngine } from './src/server/alpha_engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  const farazEngine = new FarazGoldEngine();
  const alphaEngine = new AlphaGoldEngine();

  farazEngine.start();
  alphaEngine.start();

  app.get('/api/state', (req, res) => {
    const broker = req.query.broker === 'alpha' ? 'alpha' : 'faraz';
    const state = broker === 'alpha' ? alphaEngine.getState() : farazEngine.getState();
    res.json(state);
  });

  app.post('/api/timeframe', express.json(), (req, res) => {
    const { broker, timeframe } = req.body;
    if (broker === 'alpha') alphaEngine.setTimeframe(timeframe);
    else farazEngine.setTimeframe(timeframe);
    res.json({ status: 'ok' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
