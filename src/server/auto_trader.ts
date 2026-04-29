import fs from 'fs';
import path from 'path';
import { AlphaGoldClient } from './alphagold_client.js';
import { Signal } from './strategy.js';
import { AlphaGoldEngine } from './alpha_engine.js';
import WebSocket from 'ws';

export class AutoTrader {
    client: AlphaGoldClient;
    config = {
        demoNumber: '',
        accessToken: '',
        isEnabled: false,
        tradeAmount: 1, // unit (lots)

        tpMode: 'pips' as 'pips' | 'tp1' | 'tp2' | 'tp3',
        tpPips: 200,
        slMode: 'pips' as 'pips' | 'signal',
        slPips: 200,
        
        enableTpSl: true, // <-- added
        limitMode: 'virtual' as 'broker' | 'virtual', // <-- added

        autoRiskFree: false,
        riskFreePips: 100,

        portfoType: 1
    };
    settingsFile = path.join(process.cwd(), 'autotrade_settings.json');
    ws: WebSocket | null = null;
    
    // State to push to UI
    portfo = { balance: 0, amount_ounce: 0, blocked_amount_ounce: 0 };
    openOrders: any[] = [];
    closedOrders: any[] = [];
    livePrice: number = 0;
    
    // Virtual Limits tracking
    virtualLimitsFile = path.join(process.cwd(), 'virtual_limits.json');
    virtualLimits: Record<string, {tp: number, sl: number}> = {};

    // Keep track of which orders have been risk-freed
    riskFreedOrders = new Set<string>();

    constructor() {
        this.client = new AlphaGoldClient();
        this.loadSettings();
        this.loadVirtualLimits();
        if (this.config.demoNumber) {
            this.client.setDemoNumber(this.config.demoNumber);
            this.connectLive();
        }
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const data = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
                this.config = { ...this.config, ...data };
                if (this.config.accessToken) {
                    this.client.setTokens(this.config.accessToken);
                }
            }
        } catch(e) {}
    }

    loadVirtualLimits() {
        try {
            if (fs.existsSync(this.virtualLimitsFile)) {
                this.virtualLimits = JSON.parse(fs.readFileSync(this.virtualLimitsFile, 'utf8'));
            }
        } catch(e) {}
    }

    saveVirtualLimits() {
        try {
            fs.writeFileSync(this.virtualLimitsFile, JSON.stringify(this.virtualLimits, null, 2));
        } catch(e) {}
    }

    saveSettings() {
        try {
            fs.writeFileSync(this.settingsFile, JSON.stringify(this.config, null, 2));
        } catch(e) {}
    }

    updateConfig(newConfig: Partial<typeof this.config>) {
        const wasEnabled = this.config.isEnabled;
        const oldDemo = this.config.demoNumber;
        
        this.config = { ...this.config, ...newConfig };
        this.saveSettings();
        
        if (this.config.accessToken) {
            this.client.setTokens(this.config.accessToken);
        }

        if (this.config.demoNumber && this.config.demoNumber !== oldDemo) {
            this.client.setDemoNumber(this.config.demoNumber);
            this.connectLive();
        }
        
        if (!wasEnabled && this.config.isEnabled) {
            console.log("[AutoTrader] Enabled.");
        }
    }

    connectLive() {
        if (this.ws) {
            this.ws.close();
        }
        if (!this.config.demoNumber) return;
        try {
            this.ws = this.client.connectWebSocketDemo({
                onPrice: (p) => { 
                    this.livePrice = parseFloat(p);
                    this.checkRiskFree();
                    this.checkVirtualLimits();
                },
                onOpenOrders: (orders) => { 
                    this.openOrders = orders; 
                    this.checkRiskFree(); // Also check when orders change
                    this.checkVirtualLimits();
                },
                onPortfo: (p) => { this.portfo = p; },
                onClosedOrders: (orders) => { this.closedOrders = orders; },
                onAlert: (alert) => { /* ignore alerts locally */ }
            });
        } catch(e) {
            console.error("[AutoTrader] Live WS error", e);
        }
    }

    checkRiskFree() {
        if (!this.config.autoRiskFree || !this.livePrice || this.openOrders.length === 0) return;

        for (const order of this.openOrders) {
            if (this.riskFreedOrders.has(order.id)) continue;
            
            const isBuy = order.side === 1;
            const entry = order.price;
            const current = this.livePrice; // can use sale_price, but livePrice is faster
            
            // Calculate profit in pips (alpha gold 1 pip = 0.01)
            let profitPips = 0;
            if (isBuy) profitPips = (current - entry) * 100;
            else profitPips = (entry - current) * 100;

            if (profitPips >= this.config.riskFreePips) {
                // Determine new SL (Entry point). We keep TP exactly the same.
                const newSl = entry.toFixed(2);
                const currentTp = order.profit_limit;

                console.log(`[AutoTrader] Risk-Free Triggered for Order ${order.id}. Profit: ${profitPips.toFixed(1)} pips. Moving SL to ${newSl}`);
                
                // Add to set immediately to prevent duplicate API calls
                this.riskFreedOrders.add(order.id);

                if (this.config.limitMode === 'virtual') {
                    // Update the virtual limit so the virtual monitor handles it
                    if (this.virtualLimits[order.id]) {
                        this.virtualLimits[order.id].sl = parseFloat(newSl);
                        this.saveVirtualLimits();
                        console.log(`[AutoTrader] Order ${order.id} is now Risk Free! Virtual SL moved to ${newSl}`);
                    }
                } else {
                    this.client.editOrderDemo(order.id, newSl, currentTp).then(() => {
                        console.log(`[AutoTrader] Order ${order.id} is now Risk Free! SL moved to ${newSl}`);
                    }).catch(e => {
                        console.error('[AutoTrader] Failed to set Risk Free', e.message);
                        // If failed, remove from set so it tries again
                        this.riskFreedOrders.delete(order.id);
                    });
                }
            }
        }
    }

    // Prevents sending duplicate close requests for the same order
    closingOrders = new Set<string>();

    checkVirtualLimits() {
        if (this.config.limitMode !== 'virtual' || !this.livePrice || this.openOrders.length === 0) return;

        for (const order of this.openOrders) {
            const limits = this.virtualLimits[order.id];
            if (!limits) continue;
            if (this.closingOrders.has(order.id)) continue;

            const isBuy = order.side === 1;
            const current = this.livePrice;

            let shouldClose = false;
            let reason = '';

            if (isBuy) {
                // Buy order: hits SL if current <= sl, hits TP if current >= tp
                if (current <= limits.sl) { shouldClose = true; reason = 'SL'; }
                else if (current >= limits.tp) { shouldClose = true; reason = 'TP'; }
            } else {
                // Sell order: hits SL if current >= sl, hits TP if current <= tp
                if (current >= limits.sl) { shouldClose = true; reason = 'SL'; }
                else if (current <= limits.tp) { shouldClose = true; reason = 'TP'; }
            }

            if (shouldClose) {
                console.log(`[AutoTrader] Virtual ${reason} hit for Order ${order.id} at price ${current}! Closing order...`);
                this.closingOrders.add(order.id);
                this.client.closeOrderDemo(order.id).then(() => {
                    console.log(`[AutoTrader] Successfully closed order ${order.id} via Virtual ${reason}.`);
                    delete this.virtualLimits[order.id];
                    this.saveVirtualLimits();
                }).catch(e => {
                    console.error(`[AutoTrader] Error closing order ${order.id}:`, e.message);
                    this.closingOrders.delete(order.id);
                });
            }
        }
    }

    async handleSignal(signal: Signal) {
        if (!this.config.isEnabled || !this.config.demoNumber) return;
        
        // Prevent double entries. Only 1 trade allowed at a time for safety
        if (this.openOrders.length > 0) {
            console.log(`[AutoTrader] Trade ignored. Open order exists.`);
            return;
        }

        const isBuy = signal.type === 'BUY';
        const side = isBuy ? 1 : 2;
        const amount = this.config.tradeAmount || 1;
        
        const price = this.livePrice || signal.entry;
        
        let tp: number;
        let sl: number;

        // Calculate TP
        if (this.config.tpMode === 'tp1' && signal.tp1) tp = signal.tp1;
        else if (this.config.tpMode === 'tp2' && signal.tp2) tp = signal.tp2;
        else if (this.config.tpMode === 'tp3' && signal.tp3) tp = signal.tp3;
        else {
            // fallback to pips
            const dp = this.config.tpPips * 0.01;
            tp = isBuy ? price + dp : price - dp;
        }

        // Calculate SL
        if (this.config.slMode === 'signal' && signal.sl) {
            sl = signal.sl;
        } else {
            // fallback to pips
            const ds = this.config.slPips * 0.01;
            sl = isBuy ? price - ds : price + ds;
        }

        console.log(`[AutoTrader] Executing ${signal.type} | Amount: ${amount} | SL: ${sl} | TP: ${tp} | Mode: ${this.config.limitMode} | EnableTpSl: ${this.config.enableTpSl}`);
        
        try {
            // If virtual mode OR if TP/SL are disabled, send empty strings
            const shouldSendLimitsToBroker = this.config.enableTpSl && this.config.limitMode === 'broker';
            const lossParam = shouldSendLimitsToBroker ? sl.toFixed(2) : '';
            const profitParam = shouldSendLimitsToBroker ? tp.toFixed(2) : '';

            // Wait for response to get the order ID
            const response = await this.client.openFastOrderDemo(side, amount, lossParam, profitParam);
            console.log(`[AutoTrader] Order submitted successfully!`);
            
            // Wait for WebSocket to broadcast the open order before we assign the virtual limit
            if (this.config.enableTpSl && this.config.limitMode === 'virtual' && response && response.id) {
                this.virtualLimits[response.id] = { tp, sl };
                this.saveVirtualLimits();
                console.log(`[AutoTrader] Virtual Limits saved for Order ${response.id}`);
            } else if (this.config.enableTpSl && this.config.limitMode === 'virtual') {
                 // Fallback: If we don't know order ID from response, maybe we can fetch orders
                 // or just attach to the newest order we see in websocket that doesn't have a limit
                 setTimeout(() => {
                     const ordersWithoutLimit = this.openOrders.filter(o => !this.virtualLimits[o.id]);
                     if (ordersWithoutLimit.length > 0) {
                         const matchOrder = ordersWithoutLimit[0];
                         this.virtualLimits[matchOrder.id] = { tp, sl };
                         this.saveVirtualLimits();
                         console.log(`[AutoTrader] Virtual Limits mapped via WS fallback for Order ${matchOrder.id}`);
                     }
                 }, 3000);
            }
        } catch(e: any) {
            console.error(`[AutoTrader] Error executing trade:`, e.response?.data || e.message);
        }
    }
}
