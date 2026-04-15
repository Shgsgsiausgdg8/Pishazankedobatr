import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

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
  private dataFile: string = path.join(process.cwd(), 'recorded_data.jsonl');
  private settingsFile: string = path.join(process.cwd(), 'settings.json');
  private lastCandleTime: number = 0;

  constructor() {
    this.loadSettings();
    this.loadHistory();
  }

  private async fetchHistory() {
    try {
      const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
      const timeframe = this.timeframe === '60' ? '60' : this.timeframe;
      const url = `${baseUrl}/api/room/api/get-history/?symbol=mazane&timeframe=${timeframe}&count=300`;
      
      const headers: any = {};
      if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
      if (this.sessionId) headers['Cookie'] = `sessionid=${this.sessionId}`;

      const res = await fetch(url, { headers });
      const data = await res.json();

      if (Array.isArray(data)) {
        this.candles = data.map((b: any) => ({
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
      const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
      const res = await fetch(`${baseUrl}/api/User/api/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: this.refreshToken })
      });
      const data = await res.json();
      
      if (data && data.access) {
        this.accessToken = data.access;
        if (data.refresh) this.refreshToken = data.refresh;
        this.saveSettings();
        return true;
      }
    } catch (e: any) {
      console.error(`Token refresh failed: ${e.message}`);
    }
    return false;
  }

  start() {
    this.connectWS();
    setInterval(() => this.refreshAuthToken(), 12 * 60 * 60 * 1000);
    setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.fetchPriceAPI();
      }
    }, 30000);
  }

  private connectWS() {
    const wsUrl = process.env.FARAZGOLD_WS_URL || 'wss://demo.farazgold.com/ws/';
    const finalWsUrl = this.accessToken ? `${wsUrl}?token=${this.accessToken}` : wsUrl;

    try {
      const options: any = {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Origin': 'https://demo.farazgold.com',
        }
      };

      if (this.sessionId && this.csrfToken) {
        options.headers['Cookie'] = `sessionid=${this.sessionId}; csrftoken=${this.csrfToken}`;
        options.headers['X-CSRFToken'] = this.csrfToken;
      }

      this.ws = new WebSocket(finalWsUrl, options);

      this.ws.on('open', () => {
        this.ws?.send(JSON.stringify({
          action: 'SubAdd',
          subs: [`0~farazgold~mazane~gold~${this.timeframe}`]
        }));
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.action === 'Update' && msg.data?.price) {
            this.updatePrice(parseFloat(msg.data.price));
          }
          if (msg.bars && msg.bars[this.timeframe]) {
            this.processBar(msg.bars[this.timeframe]);
          }
        } catch (e) {}
      });

      this.ws.on('close', () => setTimeout(() => this.connectWS(), 5000));
    } catch (e) {
      setTimeout(() => this.connectWS(), 5000);
    }
  }

  private async fetchPriceAPI() {
    try {
      const res = await fetch('https://demo.farazgold.com/api/room/api/get-last-price/?symbol=mazane');
      const data = await res.json();
      if (data && data.price) {
        this.updatePrice(parseFloat(data.price));
      }
    } catch (e) {}
  }

  private updatePrice(newPrice: number) {
    this.price = newPrice;
    const now = Date.now();
    const timeframeMs = (parseInt(this.timeframe) || 1) * 60000;
    const candleTime = Math.floor(now / timeframeMs) * timeframeMs;
    const candleTimeSec = candleTime / 1000;

    if (this.candles.length === 0 || candleTime > this.lastCandleTime) {
      const newCandle = { time: candleTimeSec, open: newPrice, high: newPrice, low: newPrice, close: newPrice };
      this.candles.push(newCandle);
      this.candles.sort((a, b) => a.time - b.time);
      this.lastCandleTime = candleTime;
      if (this.candles.length > 1000) this.candles.shift();
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
    const time = bar.time;
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
      this.candles.sort((a, b) => a.time - b.time);
      if (this.candles.length > 1000) this.candles.shift();
      this.lastCandleTime = time * 1000;
      this.detectLevels();
      this.recordData({ time, open, high, low, close });
    }
  }

  private detectLevels() {
    if (this.candles.length < 10) return;
    const lookback = 5;
    const lastIdx = this.candles.length - lookback - 1;
    if (lastIdx < lookback) return;

    const current = this.candles[lastIdx];
    let isHigh = true, isLow = true;
    for (let i = 1; i <= lookback; i++) {
      if (this.candles[lastIdx - i].high >= current.high || this.candles[lastIdx + i].high > current.high) isHigh = false;
      if (this.candles[lastIdx - i].low <= current.low || this.candles[lastIdx + i].low < current.low) isLow = false;
    }
    if (isHigh) this.addLevel('RESISTANCE', current.high, current.time * 1000);
    if (isLow) this.addLevel('SUPPORT', current.low, current.time * 1000);
  }

  private addLevel(type: 'SUPPORT' | 'RESISTANCE', price: number, time: number) {
    const exists = this.levels.some(l => l.type === type && Math.abs(l.price - price) < 10);
    if (!exists) {
      this.levels.push({ type, price, time });
      if (this.levels.length > 50) this.levels.shift();
    }
  }

  startRecording() { this.isRecording = true; this.recordingStartTime = Date.now(); }
  stopRecording() { this.isRecording = false; this.recordingStartTime = null; }

  private recordData(candle: any) {
    if (!this.isRecording) return;
    fs.appendFileSync(this.dataFile, JSON.stringify({ ...candle, recordedAt: Date.now() }) + '\n');
  }

  setTimeframe(tf: string) {
    if (this.timeframe === tf) return;
    this.timeframe = tf;
    this.candles = []; this.levels = []; this.lastCandleTime = 0;
    this.fetchHistory();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SubRemoveAll' }));
      this.ws.send(JSON.stringify({ action: 'SubAdd', subs: [`0~farazgold~mazane~gold~${this.timeframe}`] }));
    }
  }

  getState() {
    return { price: this.price, timeframe: this.timeframe, candles: this.candles.slice(-300), levels: this.levels, isRecording: this.isRecording };
  }
}
