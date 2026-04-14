import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import https from 'https';

export class FarazGoldEngine {
  price: number = 0;
  timeframe: string = '1'; // Default to 1m
  candles: any[] = [];
  levels: { type: 'SUPPORT' | 'RESISTANCE', price: number, time: number }[] = [];
  isRecording: boolean = false;
  recordingStartTime: number | null = null;
  
  // Auth State
  accessToken: string | null = null;
  refreshToken: string | null = null;
  sessionId: string | null = null;
  csrfToken: string | null = null;
  
  private ws: WebSocket | null = null;
  private api: AxiosInstance;
  private dataFile: string = path.join(process.cwd(), 'recorded_data.jsonl');
  private settingsFile: string = path.join(process.cwd(), 'settings.json');
  private lastCandleTime: number = 0;

  constructor() {
    this.loadSettings();
    this.api = axios.create({
      timeout: 30000,
      httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false })
    });
    this.loadHistory();
  }

  private async fetchHistory() {
    try {
      const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
      const timeframe = this.timeframe === '60' ? '60' : this.timeframe;
      const url = `${baseUrl}/api/room/api/get-history/`;
      console.log(`[Engine] Fetching history from: ${url} (TF: ${timeframe})`);
      
      const response = await this.api.get(url, {
        params: {
          symbol: 'mazane',
          timeframe: timeframe,
          count: 300
        },
        headers: {
          'Authorization': this.accessToken ? `Bearer ${this.accessToken}` : undefined,
          'Cookie': this.sessionId ? `sessionid=${this.sessionId}` : undefined
        }
      });

      if (response.data && Array.isArray(response.data)) {
        this.candles = response.data.map((b: any) => ({
          time: b.time,
          open: parseFloat(b.open),
          high: parseFloat(b.high),
          low: parseFloat(b.low),
          close: parseFloat(b.close)
        })).sort((a: any, b: any) => a.time - b.time);
        
        if (this.candles.length > 0) {
          this.lastCandleTime = this.candles[this.candles.length - 1].time * 1000;
          this.detectLevels();
        }
        console.log(`Loaded ${this.candles.length} candles for history.`);
      }
    } catch (e: any) {
      console.error(`Error fetching history: ${e.message}`);
    }
  }

  private loadHistory() {
    this.fetchHistory();
  }

  private loadSettings() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
        this.accessToken = settings.accessToken || null;
        this.refreshToken = settings.refreshToken || null;
        this.sessionId = settings.sessionId || null;
        this.csrfToken = settings.csrfToken || null;
      }
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  }

  private saveSettings() {
    try {
      const settings = {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        sessionId: this.sessionId,
        csrfToken: this.csrfToken
      };
      fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
    } catch (e) {
      console.error("Error saving settings:", e);
    }
  }

  async refreshAuthToken() {
    if (!this.refreshToken) return false;
    
    try {
      console.log("Attempting to refresh auth token...");
      const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
      const response = await axios.post(`${baseUrl}/api/User/api/token/refresh/`, {
        refresh: this.refreshToken
      });
      
      if (response.data && response.data.access) {
        this.accessToken = response.data.access;
        if (response.data.refresh) this.refreshToken = response.data.refresh;
        this.saveSettings();
        console.log("Token refreshed successfully.");
        return true;
      }
    } catch (e: any) {
      console.error(`Token refresh failed: ${e.message}`);
    }
    return false;
  }

  start() {
    this.connectWS();
    
    // Periodic token refresh (every 12 hours)
    setInterval(() => {
      this.refreshAuthToken();
    }, 12 * 60 * 60 * 1000);

    // Fallback price fetch every 30s
    setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.fetchPriceAPI();
      }
    }, 30000);
  }

  private connectWS() {
    const wsUrl = process.env.FARAZGOLD_WS_URL || 'wss://demo.farazgold.com/ws/';
    const token = this.accessToken;
    
    // Inject token into URL if available
    const finalWsUrl = token ? `${wsUrl}?token=${token}` : wsUrl;

    console.log(`Connecting to FarazGold WS: ${finalWsUrl.split('?')[0]}`);
    
    try {
      const options: any = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Origin': 'https://demo.farazgold.com',
          'Referer': 'https://demo.farazgold.com/room/',
        }
      };

      if (this.sessionId && this.csrfToken) {
        options.headers['Cookie'] = `sessionid=${this.sessionId}; csrftoken=${this.csrfToken}`;
        options.headers['X-CSRFToken'] = this.csrfToken;
      }

      this.ws = new WebSocket(finalWsUrl, options);

      this.ws.on('open', () => {
        console.log(`WS Connected, subscribing to timeframe: ${this.timeframe}`);
        // Subscribe to mazane gold bars for the current timeframe
        this.ws?.send(JSON.stringify({
          action: 'SubAdd',
          subs: [`0~farazgold~mazane~gold~${this.timeframe}`]
        }));
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          
          // Handle price updates
          if (msg.action === 'Update' && msg.data) {
            const d = msg.data;
            if (d.price) {
              this.updatePrice(parseFloat(d.price));
            }
          }
          
          // Handle bar updates for current timeframe
          if (msg.bars && msg.bars[this.timeframe]) {
            const bar = msg.bars[this.timeframe];
            this.processBar(bar);
          }
        } catch (e) {}
      });

      this.ws.on('close', () => {
        console.log("WS Closed, reconnecting in 5s...");
        setTimeout(() => this.connectWS(), 5000);
      });

      this.ws.on('error', (err) => {
        console.error("WS Error:", err.message);
      });
    } catch (e) {
      console.error("WS Connection failed:", e);
      setTimeout(() => this.connectWS(), 5000);
    }
  }

  private async fetchPriceAPI() {
    try {
      const res = await axios.get('https://demo.farazgold.com/api/room/api/get-last-price/?symbol=mazane');
      if (res.data && res.data.price) {
        this.updatePrice(parseFloat(res.data.price));
      }
    } catch (e) {}
  }

  private updatePrice(newPrice: number) {
    this.price = newPrice;
    const now = Date.now();
    const timeframeMinutes = parseInt(this.timeframe) || 1;
    const timeframeMs = timeframeMinutes * 60000;
    const candleTime = Math.floor(now / timeframeMs) * timeframeMs;
    const candleTimeSec = candleTime / 1000;

    if (this.candles.length === 0 || candleTime > this.lastCandleTime) {
      const newCandle = {
        time: candleTimeSec,
        open: newPrice,
        high: newPrice,
        low: newPrice,
        close: newPrice
      };
      this.candles.push(newCandle);
      this.candles.sort((a, b) => a.time - b.time);
      this.lastCandleTime = candleTime;
      
      if (this.candles.length > 2880) this.candles.shift(); // Keep 2 days of 1m candles
      
      this.detectLevels();
      this.recordData(newCandle);
    } else {
      const last = this.candles[this.candles.length - 1];
      if (last.time === candleTimeSec) {
        last.high = Math.max(last.high, newPrice);
        last.low = Math.min(last.low, newPrice);
        last.close = newPrice;
      }
    }
  }

  private processBar(bar: any) {
    if (!bar || !bar.time) return;
    
    const time = bar.time; // This is already in seconds from FarazGold
    const open = parseFloat(bar.open || bar.close);
    const high = parseFloat(bar.high || bar.close);
    const low = parseFloat(bar.low || bar.close);
    const close = parseFloat(bar.close);

    if (isNaN(close)) return;

    const existingIdx = this.candles.findIndex(c => c.time === time);
    if (existingIdx !== -1) {
      this.candles[existingIdx] = { time, open, high, low, close };
    } else {
      this.candles.push({ time, open, high, low, close });
      // Sort and keep only unique timestamps
      this.candles.sort((a, b) => a.time - b.time);
      
      if (this.candles.length > 2880) this.candles.shift();
      this.lastCandleTime = time * 1000;
      this.detectLevels();
      this.recordData({ time, open, high, low, close });
    }
  }

  private detectLevels() {
    if (this.candles.length < 10) return;
    
    // Simple Peak/Trough detection
    const lookback = 5;
    const lastIdx = this.candles.length - lookback - 1;
    if (lastIdx < lookback) return;

    const current = this.candles[lastIdx];
    let isHigh = true;
    let isLow = true;

    for (let i = 1; i <= lookback; i++) {
      if (this.candles[lastIdx - i].high >= current.high || this.candles[lastIdx + i].high > current.high) isHigh = false;
      if (this.candles[lastIdx - i].low <= current.low || this.candles[lastIdx + i].low < current.low) isLow = false;
    }

    if (isHigh) {
      this.addLevel('RESISTANCE', current.high, current.time * 1000);
    }
    if (isLow) {
      this.addLevel('SUPPORT', current.low, current.time * 1000);
    }
  }

  private addLevel(type: 'SUPPORT' | 'RESISTANCE', price: number, time: number) {
    // Avoid duplicate levels at same price/time
    const exists = this.levels.some(l => l.type === type && Math.abs(l.price - price) < 10);
    if (!exists) {
      this.levels.push({ type, price, time });
      if (this.levels.length > 50) this.levels.shift();
    }
  }

  startRecording() {
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    console.log("Recording started");
  }

  stopRecording() {
    this.isRecording = false;
    this.recordingStartTime = null;
    console.log("Recording stopped");
  }

  private recordData(candle: any) {
    if (!this.isRecording) return;
    
    const data = JSON.stringify({ ...candle, recordedAt: Date.now() }) + '\n';
    fs.appendFileSync(this.dataFile, data);
  }

  setTimeframe(tf: string) {
    if (this.timeframe === tf) return;
    console.log(`[Engine] Switching timeframe from ${this.timeframe} to ${tf}`);
    this.timeframe = tf;
    this.candles = []; 
    this.levels = [];
    this.lastCandleTime = 0;
    
    this.fetchHistory();
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`[Engine] Updating WS subscriptions for ${tf}`);
      // Unsubscribe from all to be sure
      this.ws.send(JSON.stringify({ action: 'SubRemoveAll' }));
      // Re-subscribe to new timeframe
      this.ws.send(JSON.stringify({
        action: 'SubAdd',
        subs: [`0~farazgold~mazane~gold~${this.timeframe}`]
      }));
    }
  }

  getState() {
    return {
      price: this.price,
      timeframe: this.timeframe,
      candles: this.candles.slice(-300), // Send last 300 for UI
      levels: this.levels,
      isRecording: this.isRecording
    };
  }
}
