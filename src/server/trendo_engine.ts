import ioClient from 'socket.io-client';
const io = (ioClient as any).io || ioClient;
import { getSetting, setSetting } from './db.js';

export interface TrendoOrder {
    id: number;
    symbol: string;
    type: number; // 0: Buy, 1: Sell
    size: number;
    openPrice: number;
    sl: number;
    tp: number;
    profit: number;
    token: string;
    time: number;
}

export class TrendoEngine {
    socket: any | null = null;
    
    // Account details
    userId = process.env.TRENDO_USER_ID || '747117';
    userToken = process.env.TRENDO_USER_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwOi8vYXBpLnRyZW5kb2Z4LmNvbS9hcGkvdjEvdXNlci9yZWdpc3RlciIsImlhdCI6MTc3NzY4MzQ2NSwiZXhwIjo0OTMzNDQzNDY1LCJuYmYiOjE3Nzc2ODM0NjUsImp0aSI6IkY1SnJpSGhJYkJDT0pwTDciLCJzdWIiOiI3NDcxMTciLCJwcnYiOiI4N2UwYWYxZWY5ZmQxNTgxMmZkZWM5NzE1M2ExNGUwYjA0NzU0NmFhIn0.3pLf9zAkyPyxmPkbEoxvCKJYwpWt6ig2MmH_OAt6uW8';
    walletId = process.env.TRENDO_WALLET_ID || '2517091';
    walletToken = process.env.TRENDO_WALLET_TOKEN || 'MQicZOHD1QAjknnX0R5f';
    wsUrl = process.env.TRENDO_WS_URL || 'wss://fl4.trendoforex.com:8443';

    device = {
        os: "android", build_number: "4402", version_name: "4.4.02_telegram",
        package_name: "com.trendo.android", market: "telegram",
        device_id: "83d141b2f31ed4cc", device: "SM-A515F", lang: "en"
    };

    userTokenMirror = "";
    balance = 0;
    equity = 0;
    activeOrders: Record<number, TrendoOrder> = {};
    closedOrders: any[] = [];
    prices: Record<string, { bid: number, ask: number }> = {};
    activeSymbols: Set<string> = new Set();
    activeCharts: Map<string, number> = new Map(); // symbol -> timeframe
    isEnabled = true;
    pingInterval: NodeJS.Timeout | null = null;
    onPriceUpdate: ((symbol: string, bid: number, ask: number) => void) | null = null;
    onChartUpdate: ((symbol: string, timeframe: number, isLast: boolean, candle: any) => void) | null = null;

    constructor() {
        this.loadSettings();
    }


    loadSettings() {
        const settings = getSetting('trendo_settings');
        if (settings) {
            this.userId = settings.userId || this.userId;
            this.userToken = settings.userToken || this.userToken;
            this.walletId = settings.walletId || this.walletId;
            this.walletToken = settings.walletToken || this.walletToken;
            this.isEnabled = settings.isEnabled !== undefined ? settings.isEnabled : true;
        }
    }

    saveSettings() {
        setSetting('trendo_settings', {
            userId: this.userId,
            userToken: this.userToken,
            walletId: this.walletId,
            walletToken: this.walletToken,
            isEnabled: this.isEnabled
        });
    }

    start() {
        if (!this.isEnabled) return;
        this.connect();
    }

    connect() {
        if (this.socket) this.socket.disconnect();

        this.socket = io(this.wsUrl, {
            path: "/socket.io",
            transports: ["websocket"],
            upgrade: false,
            extraHeaders: { "User-Agent": "Dart/3.9 (dart:io)" }
        });

        this.socket.on('connect', () => {
            console.log('[Trendo] Connected to WebSocket');
            this.authenticate();
            
            // Raw ping/pong handler for specific Trendo server requirements
            const engine = this.socket?.io?.engine;
            if (engine) {
                engine.on('message', (msg: any) => {
                    if (msg === '2') {
                        // Server sent ping, we send pong (3)
                        engine.write('3');
                    }
                });
            }

            // Application level keep-alive (myPing / myPong)
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.pingInterval = setInterval(() => {
                if (this.socket?.connected) {
                    this.socket.emit('myPing', Date.now());
                }
            }, 20000);
        });

        this.socket.onAny((event: string, data: any) => {
            // console.log(`[Trendo WS EVENT] ${event}`); // too spammy maybe?
            if (event.startsWith("chart_") && data) {
                console.log(`[Trendo] Received chart data for ${event}, candles info:`, data?.Candle?.length, data?.candleLast ? 'has candleLast' : 'no candleLast');
                const chartData = data;
                if (chartData && Array.isArray(chartData.Candle) && this.onChartUpdate) {
                    for (const c of chartData.Candle) {
                        this.onChartUpdate(chartData.name, chartData.timeFrame, false, c);
                    }
                    if (chartData.candleLast) {
                        this.onChartUpdate(chartData.name, chartData.timeFrame, true, chartData.candleLast);
                    }
                }
            } else if (event.startsWith("item_price_") && !event.startsWith("item_price_spread_")) {
                const symbol = event.substring("item_price_".length);
                try {
                    if (Array.isArray(data) && data[0]?.Ask) {
                        const ask = parseFloat(data[0].Ask);
                        const bid = parseFloat(data[0].Bid);
                        this.prices[symbol] = { ask, bid };
                        if (this.onPriceUpdate) this.onPriceUpdate(symbol, bid, ask);
                    }
                } catch (e) {}
            }
        });

        this.socket.on("send_message", (msg: any) => {
            if (msg?.user_token_mirror) this.userTokenMirror = msg.user_token_mirror;

            if (msg?.event === "order_change") {
                if (msg.mode_close === 0) {
                    this.activeOrders[msg.id] = {
                        id: msg.id,
                        symbol: msg.symbol,
                        type: msg.type,
                        openPrice: parseFloat(msg.open),
                        size: parseFloat(msg.size || msg.open_size),
                        sl: msg.sl && msg.sl !== "0" ? parseFloat(msg.sl) : 0,
                        tp: msg.tp && msg.tp !== "0" ? parseFloat(msg.tp) : 0,
                        profit: parseFloat(msg.profit || 0),
                        token: msg.token,
                        time: msg.time || Date.now()
                    };
                } else if (msg.mode_close === 3) {
                    if (this.activeOrders[msg.id]) {
                        this.closedOrders.push({
                            ...this.activeOrders[msg.id],
                            closePrice: parseFloat(msg.open || "0"),
                            profit: parseFloat(msg.profit || "0")
                        });
                        // Keep only recent closed orders
                        if (this.closedOrders.length > 50) this.closedOrders.shift();
                        delete this.activeOrders[msg.id];
                    }
                }
            }

            if (msg?.event === "all_orders_wallet") {
                this.balance = parseFloat(msg.wallet_data?.balance || 0);
                this.equity = parseFloat(msg.wallet_data?.equity || 0);
                if (msg.orders) {
                    msg.orders.forEach((o: any) => {
                        this.activeOrders[o.id] = {
                            id: o.id,
                            symbol: o.symbol,
                            type: o.type,
                            openPrice: parseFloat(o.open),
                            size: parseFloat(o.size),
                            sl: o.sl && o.sl !== "0" ? parseFloat(o.sl) : 0,
                            tp: o.tp && o.tp !== "0" ? parseFloat(o.tp) : 0,
                            profit: parseFloat(o.profit || 0),
                            token: o.token,
                            time: o.time || Date.now()
                        };
                    });
                }
            }

            if (msg?.status?.msg) {
                console.log(`[Trendo] Server Msg: ${msg.status.msg}`);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('[Trendo] Disconnected');
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.activeSymbols.clear();
        });

        this.socket.on('error', (err: any) => {
            console.error('[Trendo] Socket Error:', err);
        });
    }

    authenticate() {
        if (!this.socket) return;
        
        console.log('[Trendo] Logging in...');
        this.socket.emit("login", { 
            user_id: parseInt(this.userId), 
            user_token: this.userToken, 
            wallet_id: parseInt(this.walletId), 
            wallet_token: this.walletToken, 
            ...this.device 
        });

        this.socket.on("login_client", (data: any) => {
            if (data?.isLogin) {
                console.log("[Trendo] Authentication Success");
                this.socket.emit("user_joins", { 
                    join: "join", 
                    rooms: ["symbol_list_top", "lang_en"], 
                    ...this.device 
                });
                this.socket.emit("symbol_list", "btcusd");
                this.ensurePriceRoom("btcusd");
                
                // Re-subscribe to charts if any
                for (const [sym, tf] of this.activeCharts.entries()) {
                    this.subscribeChart(sym, tf);
                }
            }
        });
    }

    async ensurePriceRoom(symbol: string) {
        if (this.activeSymbols.has(symbol.toLowerCase())) return;
        if (!this.socket) return;

        console.log(`[Trendo] Joining price room for ${symbol}`);
        this.socket.emit('user_join', {
            join: "join",
            room: `item_price_${symbol.toLowerCase()}`,
            ...this.device
        });

        this.activeSymbols.add(symbol.toLowerCase());
    }

    subscribeChart(symbol: string, timeframe: number) {
        this.activeCharts.set(symbol.toLowerCase(), timeframe);
        if (!this.socket || !this.socket.connected) return;
        
        console.log(`[Trendo] Subscribing to chart for ${symbol} timeframe ${timeframe}`);

        // The sequence required by Trendo
        this.socket.emit("user_join", {
            join: "join",
            room: `item_price_spread_${timeframe}_${symbol.toLowerCase()}`,
            ...this.device
        });

        this.socket.emit("user_join", {
            join: "join",
            room: `room_item_price_${timeframe}_${symbol.toLowerCase()}`,
            ...this.device
        });

        this.socket.emit("user_join", {
            join: "join",
            room: `chart_${symbol.toLowerCase()}_${timeframe}`,
            ...this.device
        });

        const endTime = Math.floor(Date.now() / 1000); 
        const startTime = endTime - (1000 * timeframe * 60); // request up to 1000 candles
        
        this.socket.emit("start_chart", {
            event: "start_chart",
            symbol: symbol.toLowerCase(),
            timeFrame: timeframe,
            candle_time: 0,
            isRight: false,
            startTimeCandle: startTime,
            endTimeCandle: endTime,
            primary_chart_key: Math.floor(Math.random() * 1000000000), 
            version: "V2",
            ...this.device
        });
    }

    async waitForPrice(symbol: string, timeout = 5000): Promise<boolean> {
        const start = Date.now();
        const sym = symbol.toLowerCase();
        while (Date.now() - start < timeout) {
            if (this.prices[sym]) return true;
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        return false;
    }

    async openOrder(symbol: string, type: number, size: number, sl = 0, tp = 0) {
        if (!this.socket) throw new Error('Not connected');
        
        const sym = symbol.toLowerCase();
        await this.ensurePriceRoom(sym);
        
        const hasPrice = await this.waitForPrice(sym);
        if (!hasPrice) throw new Error(`Price not received for ${symbol}`);

        const currentPrice = this.prices[sym];
        const openPrice = type === 0 ? currentPrice.ask : currentPrice.bid;
        const formatted = openPrice.toFixed(sym === "xauusd" ? 2 : 1);

        const now = Date.now();
        console.log('[Trendo] Breaking lock (close_all_order)');
        this.socket.emit('user_emit', {
            event: 'close_all_order',
            primary_order: now,
            user_id: parseInt(this.userId),
            wallet_id: parseInt(this.walletId),
            wallet_token: this.walletToken,
            user_token_mirror: this.userTokenMirror,
            ...this.device
        });

        // Wait for lock to break
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log(`[Trendo] Sending order_add for ${sym} at ${formatted}`);
        this.socket.emit('user_emit', {
            event: 'order_add',
            primary_order: now + 1,
            user_id: parseInt(this.userId),
            wallet_id: parseInt(this.walletId),
            wallet_token: this.walletToken,
            user_token_mirror: this.userTokenMirror,
            symbol: sym,
            type: type, // 0 buy, 1 sell
            open: formatted,
            size: size,
            sl: String(sl),
            tp: String(tp),
            calculation: sym === "xauusd" ? 2 : 1,
            contract_size: sym === "xauusd" ? 100 : (["eurusd","gbpusd","usdjpy"].includes(sym) ? 100000 : 1),
            ...this.device
        });
    }

    async closeOrderById(orderId: number) {
        if (!this.socket) return;
        const order = this.activeOrders[orderId];
        if (!order) throw new Error('Order not found');

        console.log(`[Trendo] Closing order ${orderId}`);
        this.socket.emit('user_emit', {
            event: 'order_close',
            id: orderId,
            token: order.token,
            symbol: order.symbol,
            size: order.size,
            user_id: parseInt(this.userId),
            wallet_id: parseInt(this.walletId),
            wallet_token: this.walletToken,
            primary_order: Date.now(),
            ...this.device
        });
    }

    async closeAllOrders() {
        if (!this.socket) return;
        console.log('[Trendo] Closing all orders');
        this.socket.emit('user_emit', {
            event: 'order_close_all',
            mode: 0,
            user_id: parseInt(this.userId),
            wallet_id: parseInt(this.walletId),
            wallet_token: this.walletToken,
            primary_order: Date.now(),
            ...this.device
        });
    }

    async modifyOrder(orderId: number, { sl, tp }: { sl?: number, tp?: number }) {
        if (!this.socket) return;
        const order = this.activeOrders[orderId];
        if (!order) throw new Error('Order not found');

        console.log(`[Trendo] Modifying order ${orderId}`);
        this.socket.emit('user_emit', {
            event: 'order_edit',
            user_id: parseInt(this.userId),
            wallet_id: parseInt(this.walletId),
            wallet_token: this.walletToken,
            id: orderId,
            token: order.token,
            symbol: order.symbol,
            type: order.type,
            size: order.size,
            open: order.openPrice.toFixed(order.symbol === 'xauusd' ? 2 : 1),
            sl: sl !== undefined ? String(sl) : (order.sl ? String(order.sl) : "0"),
            tp: tp !== undefined ? String(tp) : (order.tp ? String(order.tp) : "0"),
            primary_order: Date.now(),
            ...this.device
        });
    }

    getState() {
        return {
            broker: 'trendo',
            balance: this.balance,
            equity: this.equity,
            activeOrders: Object.values(this.activeOrders),
            closedOrders: this.closedOrders,
            prices: this.prices,
            isEnabled: this.isEnabled
        };
    }
}
