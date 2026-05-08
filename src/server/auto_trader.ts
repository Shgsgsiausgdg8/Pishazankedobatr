import { AlphaGoldClient } from './alphagold_client.js';
import { Signal } from './strategy.js';
import { AlphaGoldEngine } from './alpha_engine.js';
import WebSocket from 'ws';
import { getSetting, setSetting } from './db.js';
import { Messenger, ReportStats } from './messenger.js';

export class AutoTrader {
    client: AlphaGoldClient;
    messenger: Messenger;

    // Settings
    config = {
        accountMode: 'demo' as 'demo' | 'real',
        demoNumber: '',
        accessToken: '',
        isEnabled: false,
        tradeAmount: 1, // unit (lots)
        maxOpenTrades: 1, // unit (number)

        enableTimeWindow: false,
        tradeStartTime: '08:00',
        tradeEndTime: '20:00',

        tpMode: 'pips' as 'pips' | 'tp1' | 'tp2' | 'tp3',
        tpPips: 200,
        slMode: 'pips' as 'pips' | 'signal',
        slPips: 200,
        
        enableTpSl: true, 
        limitMode: 'virtual' as 'broker' | 'virtual',

        autoRiskFree: false,
        riskFreeMode: 'pips' as 'pips' | 'targets',
        riskFreePips: 100,

        portfoType: 1,

        // Bale Notification Settings
        baleToken: '',
        baleChatId: '',
        baleEnabled: false
    };

    ws: WebSocket | null = null;
    
    // State to push to UI
    portfo = { balance: 0, amount_ounce: 0, blocked_amount_ounce: 0 };
    openOrders: any[] = [];
    closedOrders: any[] = [];
    livePrice: number = 0;
    
    // Virtual Limits tracking
    virtualLimits: Record<string, {tp: number, sl: number}> = {};

    // Keep track of original signal for each order to move SL based on targets
    orderSignals: Record<string, Signal> = {};

    // Keep track of last hit TP level for each order (0=none, 1=TP1, etc.)
    orderTpProgress: Record<string, number> = {};

    // Bale message IDs for replies
    baleOpenMessageIds: Record<string, number> = {};

    // Notification states
    notifiedOpenOrders = new Set<string>();
    notifiedClosedOrders = new Set<string>();

    // Report tracking
    reportStats: ReportStats = {
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        totalProfit: 0,
        broker: 'آلفا گلد'
    };

    constructor() {
        this.client = new AlphaGoldClient();
        this.messenger = new Messenger();
        this.loadSettings();
        this.loadVirtualLimits();
        this.loadOrderSignals();
        this.applyAccountMode();
        this.connectLive();
        this.startPeriodicReport();
    }

    startPeriodicReport() {
        // Send report every 30 minutes
        setInterval(() => {
            if (this.config.isEnabled && this.config.baleEnabled && (this.reportStats.totalTrades > 0)) {
                this.messenger.sendPeriodicReport(this.reportStats, this.config.accountMode);
                // Reset stats for next 30 min
                this.reportStats = {
                    totalTrades: 0,
                    winTrades: 0,
                    lossTrades: 0,
                    totalProfit: 0,
                    broker: 'آلفا گلد'
                };
            }
        }, 30 * 60 * 1000);
    }

    applyAccountMode() {
        this.client.setMode(this.config.accountMode);
        if (this.config.demoNumber) {
            this.client.setDemoNumber(this.config.demoNumber);
        }
        if (this.config.accessToken) {
            this.client.setTokens(this.config.accessToken);
        }
        this.messenger.updateConfig(this.config.baleToken, this.config.baleChatId);
    }

    loadSettings() {
        try {
            const data = getSetting('autotrade_settings');
            if (data) {
                this.config = { ...this.config, ...data };
                if (this.config.accessToken) {
                    this.client.setTokens(this.config.accessToken);
                }
            }
        } catch(e) {}
    }

    loadVirtualLimits() {
        try {
            const data = getSetting('virtual_limits');
            if (data) {
                this.virtualLimits = data;
            }
        } catch(e) {}
    }

    saveVirtualLimits() {
        try {
            setSetting('virtual_limits', this.virtualLimits);
        } catch(e) {}
    }

    saveSettings() {
        try {
            setSetting('autotrade_settings', this.config);
        } catch(e) {}
    }

    loadOrderSignals() {
        try {
            const data = getSetting('order_signals');
            if (data) {
                this.orderSignals = data.signals || {};
                this.orderTpProgress = data.progress || {};
                this.baleOpenMessageIds = data.baleIds || {};
            }
        } catch(e) {}
    }

    saveOrderSignals() {
        try {
            setSetting('order_signals', {
                signals: this.orderSignals,
                progress: this.orderTpProgress,
                baleIds: this.baleOpenMessageIds
            });
        } catch(e) {}
    }

    updateConfig(newConfig: Partial<typeof this.config>) {
        const wasEnabled = this.config.isEnabled;
        const oldMode = this.config.accountMode;
        const oldDemo = this.config.demoNumber;
        const oldToken = this.config.accessToken;
        
        this.config = { ...this.config, ...newConfig };
        this.saveSettings();
        
        this.applyAccountMode();

        const needsReconnect = (
            (this.config.accountMode !== oldMode) ||
            (this.config.accountMode === 'demo' && this.config.demoNumber !== oldDemo) ||
            (this.config.accountMode === 'real' && this.config.accessToken !== oldToken) ||
            (!wasEnabled && this.config.isEnabled)
        );

        if (needsReconnect) {
            this.connectLive();
        }
        
        if (!wasEnabled && this.config.isEnabled) {
            console.log("[AutoTrader] Enabled.");
        }
    }

    connectLive() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.config.accountMode === 'demo' && !this.config.demoNumber) return;
        if (this.config.accountMode === 'real' && !this.config.accessToken) return;

        try {
            this.ws = this.client.connectWebSocket({
                onPrice: (p) => { 
                    this.livePrice = parseFloat(p);
                    this.checkRiskFree();
                    this.checkVirtualLimits();
                },
                onOpenOrders: (orders) => { 
                    this.openOrders = orders; 
                    this.checkRiskFree(); // Also check when orders change
                    this.checkVirtualLimits();
                    
                    // Notification for new open orders
                    for (const order of orders) {
                        const id = String(order.id);
                        if (!this.notifiedOpenOrders.has(id)) {
                            if (this.config.baleEnabled) {
                                const signal = this.orderSignals[id];
                                const replyToSignalId = (signal as any)?.baleMessageId;
                                
                                this.messenger.sendTradeOpen(order, this.config.accountMode, replyToSignalId)
                                    .then(msgId => {
                                        if (msgId) {
                                            this.baleOpenMessageIds[id] = msgId;
                                            this.saveOrderSignals();
                                        }
                                    });
                            }
                            this.notifiedOpenOrders.add(id);
                        }
                    }
                },
                onPortfo: (p) => { this.portfo = p; },
                onClosedOrders: (orders) => { 
                    this.closedOrders = orders; 
                    
                    // Notification for newly closed orders
                    for (const order of orders) {
                        const id = String(order.id);
                        if (!this.notifiedClosedOrders.has(id)) {
                            const profit = parseFloat(order.profit || 0);
                            const reason = this.virtualLimits[id] ? 'Virtual' : 'Broker';
                            
                            if (this.config.baleEnabled) {
                                const replyToOpenId = this.baleOpenMessageIds[id];
                                this.messenger.sendTradeClose(order, reason, profit, this.config.accountMode, replyToOpenId);
                            }
                            
                            this.notifiedClosedOrders.add(id);
                            delete this.baleOpenMessageIds[id];
                            this.saveOrderSignals();
                            
                            // Stats for 30m report
                            this.reportStats.totalTrades++;
                            this.reportStats.totalProfit += profit;
                            if (profit >= 0) this.reportStats.winTrades++;
                            else this.reportStats.lossTrades++;
                        }
                    }
                },
                onAlert: (alert) => { /* ignore alerts locally */ },
                onClose: () => {
                    console.log("[AutoTrader] Websocket closed, reconnecting in 5s...");
                    this.ws = null;
                    setTimeout(() => this.connectLive(), 5000);
                },
                onError: (err) => {
                    console.error("[AutoTrader] Websocket error:", err.message);
                }
            });
        } catch(e) {
            console.error("[AutoTrader] Live WS error", e);
            setTimeout(() => this.connectLive(), 5000);
        }
    }

    checkRiskFree() {
        if (!this.config.autoRiskFree || !this.livePrice || this.openOrders.length === 0) return;

        for (const order of this.openOrders) {
            const sideVal = String(order.side).toLowerCase();
            const isBuy = sideVal === '1' || sideVal === 'buy';
            const entry = order.price;
            const current = this.livePrice;

            if (this.config.riskFreeMode === 'targets') {
                this.handleTargetBasedRiskFree(order);
                continue;
            }

            // Legacy Pips mode
            if (this.orderTpProgress[order.id] && this.orderTpProgress[order.id] > 0) continue; 
            
            // Calculate profit in pips (alpha gold 1 pip = 0.01)
            let profitPips = 0;
            if (isBuy) profitPips = (current - entry) * 100;
            else profitPips = (entry - current) * 100;

            if (profitPips >= this.config.riskFreePips) {
                this.moveSL(order, entry, 0.5); // Level 0.5 means pips mode risk free
            }
        }
    }

    handleTargetBasedRiskFree(order: any) {
        const orderIdStr = String(order.id);
        const signal = this.orderSignals[orderIdStr];
        if (!signal) return;

        const sideVal = String(order.side).toLowerCase();
        const isBuy = sideVal === '1' || sideVal === 'buy';
        const current = this.livePrice;
        const entry = parseFloat(order.price);
        const currentProgress = this.orderTpProgress[orderIdStr] || 0;

        // Possible targets in order: extract and sanitize
        let rawTargets = [signal.tp1, signal.tp2, signal.tp3, signal.tp4, signal.tp5, signal.tp6, signal.tp7]
            .map(t => typeof t === 'string' ? parseFloat(t) : t)
            .filter(t => t !== undefined && t !== null && !isNaN(t as number)) as number[];
        
        // Define base comparison entry to prevent small slippage from breaking structure
        // E.g., if order.price slipped PAST TP1, valid targets logic might drop TP1
        const signalEntry = parseFloat(String(signal.entry)) || entry;
        
        let validTargets: number[] = [];
        if (isBuy) {
            validTargets = rawTargets.filter(t => t > signalEntry).sort((a,b) => a - b);
        } else {
            validTargets = rawTargets.filter(t => t < signalEntry).sort((a,b) => b - a);
        }

        let newProgress = currentProgress;
        let targetToMoveTo: number | null = null;

        for (let i = 0; i < validTargets.length; i++) {
            const targetLevel = i + 1;
            const targetPrice = validTargets[i];
            const hit = isBuy ? (current >= targetPrice - 0.05) : (current <= targetPrice + 0.05);

            if (targetLevel <= currentProgress) continue;

            console.log(`[AutoTrader] Order ${orderIdStr} check TP${targetLevel}. Price: ${current}, Target: ${targetPrice}, Hit: ${hit}`);

            if (hit) {
                newProgress = targetLevel;
                // Logic: 
                // Hit TP1 -> move SL to Entry
                // Hit TP2 -> move SL to TP1
                // Hit TP3 -> move SL to TP2
                if (targetLevel === 1) {
                    targetToMoveTo = entry;
                } else {
                    targetToMoveTo = validTargets[i - 1]; // Previous TP
                }
            }
        }

        if (targetToMoveTo !== null) {
            console.log(`[AutoTrader] STEP-RISKFREE: Order ${orderIdStr} reached TP${newProgress}. Price: ${current}. Moving SL to ${targetToMoveTo}`);
            this.moveSL(order, targetToMoveTo, newProgress);
        }
    }

    private slMoveInFlight = new Set<string>();

    async moveSL(order: any, newSlPrice: number, progressLevel: number) {
        const orderIdStr = String(order.id);
        
        if (this.slMoveInFlight.has(orderIdStr)) return; // Prevent spamming while request is pending

        const newSl = newSlPrice.toFixed(2);
        
        let currentTp: number | string = '';
        if (order.profit_limit !== undefined && order.profit_limit !== null && String(order.profit_limit) !== '0') {
            currentTp = parseFloat(String(order.profit_limit)).toFixed(2);
        }

        // Check if movement is valid (not moving back)
        const currentSlStr = String(order.loss_limit || '');
        const currentSl = parseFloat(currentSlStr);
        
        if (!isNaN(currentSl) && currentSl !== 0) {
            const sideVal = String(order.side).toLowerCase();
            const isBuy = sideVal === '1' || sideVal === 'buy';
            const isMovingBack = isBuy ? (parseFloat(newSl) < currentSl) : (parseFloat(newSl) > currentSl);
            if (isMovingBack) {
                console.log(`[AutoTrader] Skip SL Move for ${orderIdStr}: new SL ${newSl} would be worse than current ${currentSl}`);
                return; 
            }
        }

        if (this.config.limitMode === 'virtual') {
            // Update local state
            this.orderTpProgress[orderIdStr] = progressLevel;
            this.saveOrderSignals();

            if (this.virtualLimits[orderIdStr]) {
                this.virtualLimits[orderIdStr].sl = parseFloat(newSl);
                this.saveVirtualLimits();
                console.log(`[AutoTrader] Virtual SL for ${orderIdStr} moved to ${newSl}`);
            } else {
                this.virtualLimits[orderIdStr] = { tp: parseFloat(String(currentTp || '0')), sl: parseFloat(newSl) };
                this.saveVirtualLimits();
            }

            // Send notification
            if (this.config.baleEnabled) {
                this.messenger.sendSLUpdate(order, newSl, progressLevel, this.baleOpenMessageIds[orderIdStr]);
            }
        } else {
            this.slMoveInFlight.add(orderIdStr);
            try {
                await this.client.editOrder(orderIdStr, newSl, currentTp);
                console.log(`[AutoTrader] Order ${orderIdStr} SL moved to ${newSl} via Broker (TP: ${currentTp})`);
                
                // Update local state ONLY on success
                this.orderTpProgress[orderIdStr] = progressLevel;
                this.saveOrderSignals();

                // Send notification
                if (this.config.baleEnabled) {
                    this.messenger.sendSLUpdate(order, newSl, progressLevel, this.baleOpenMessageIds[orderIdStr]);
                }
            } catch (e: any) {
                console.error(`[AutoTrader] Failed to move SL for ${orderIdStr}:`, e.message);
                // On failure, don't update progress so it retries on next tick
            } finally {
                this.slMoveInFlight.delete(orderIdStr);
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

            const sideVal = String(order.side).toLowerCase();
            const isBuy = sideVal === '1' || sideVal === 'buy';
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
                this.client.closeOrder(order.id).then(() => {
                    console.log(`[AutoTrader] Successfully closed order ${order.id} via Virtual ${reason}.`);
                    
                    // We don't notify here because it will appear in closedOrders list from WS
                    // thus avoiding double notification. 
                    // But we can mark the reason if we want.
                    
                    delete this.virtualLimits[order.id];
                    this.saveVirtualLimits();
                }).catch(e => {
                    console.error(`[AutoTrader] Error closing order ${order.id}:`, e.message);
                    this.closingOrders.delete(order.id);
                });
            }
        }
    }

    async handleSignal(signal: Signal, baleMessageId?: number) {
        if (!this.config.isEnabled) return;
        if (this.config.accountMode === 'demo' && !this.config.demoNumber) return;
        if (this.config.accountMode === 'real' && !this.config.accessToken) return;
        
        // Save mapping of signal to message ID for future replies
        if (baleMessageId) {
            (signal as any).baleMessageId = baleMessageId;
        }
        
        // Time window check
        if (this.config.enableTimeWindow && this.config.tradeStartTime && this.config.tradeEndTime) {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Tehran',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            const timeStr = formatter.format(now);
            const [nowH, nowM] = timeStr.split(':').map(Number);
            const [startH, startM] = this.config.tradeStartTime.split(':').map(Number);
            const [endH, endM] = this.config.tradeEndTime.split(':').map(Number);
            
            const nowTime = nowH * 60 + nowM;
            const startTime = startH * 60 + startM;
            const endTime = endH * 60 + endM;

            let inWindow = false;
            if (startTime <= endTime) {
                inWindow = nowTime >= startTime && nowTime <= endTime;
            } else {
                inWindow = nowTime >= startTime || nowTime <= endTime;
            }

            if (!inWindow) {
                console.log(`[AutoTrader] Trade ignored. Time window constraint (${this.config.tradeStartTime} - ${this.config.tradeEndTime}), current time: ${timeStr} (Tehran Time)`);
                return;
            }
        }

        // Prevent double entries. Only maxOpenTrades allowed at a time for safety
        if (this.openOrders.length >= (this.config.maxOpenTrades || 1)) {
            console.log(`[AutoTrader] Trade ignored. Open order limit reached. Limit: ${this.config.maxOpenTrades || 1}, Current: ${this.openOrders.length}`);
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
            let response;
            let retries = 0;
            const maxRetries = 2;
            
            while (retries <= maxRetries) {
                try {
                    if (this.config.enableTpSl && this.config.limitMode === 'broker') {
                        console.log(`[AutoTrader] Opening order with broker limits: SL=${lossParam}, TP=${profitParam}`);
                        response = await this.client.openFastOrder(side, amount, lossParam, profitParam);
                    } else {
                        console.log(`[AutoTrader] Opening order WITHOUT limits (using virtual SL/TP loop)...`);
                        response = await this.client.openFastOrder(side, amount, '', '');
                    }
                    break; 
                } catch (err: any) {
                    const isNetworkError = err.message.includes('EAI_AGAIN') || err.message.includes('ECONN') || err.message.includes('fetch failed');
                    if (isNetworkError && retries < maxRetries) {
                        retries++;
                        console.log(`[AutoTrader] Network error, retrying (${retries}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue;
                    }
                    throw err;
                }
            }
            
            console.log(`[AutoTrader] Order submitted successfully!`);
            
            const orderId = response?.id || response?.order_id || (response?.data?.id);
            if (orderId) {
                const finalId = String(orderId);
                this.orderSignals[finalId] = signal;
                this.orderTpProgress[finalId] = 0;
                this.saveOrderSignals();
                console.log(`[AutoTrader] Signal mapped to Order ID: ${finalId}`);
            } else {
                console.warn(`[AutoTrader] Could not find ID in broker response:`, response);
            }

            // Wait for WebSocket to broadcast the open order before we assign the virtual limit
            if (orderId) {
                if (this.config.enableTpSl && this.config.limitMode === 'virtual') {
                    const finalId = String(orderId);
                    this.virtualLimits[finalId] = { tp, sl };
                    this.saveVirtualLimits();
                    console.log(`[AutoTrader] Virtual Limits saved for Order ${finalId}`);
                }
            } else {
                 // Fallback: If we don't know order ID from response, maybe we can fetch orders
                 // or just attach to the newest order we see in websocket that isn't mapped
                 setTimeout(() => {
                     const fallbackOrder = this.openOrders.find(o => !this.orderSignals[String(o.id)]);
                     if (fallbackOrder) {
                         const finalId = String(fallbackOrder.id);
                         
                         // Map the signal
                         this.orderSignals[finalId] = signal;
                         this.orderTpProgress[finalId] = 0;
                         this.saveOrderSignals();
                         console.log(`[AutoTrader] Signal mapped via WS fallback for Order ID: ${finalId}`);

                         // Map the virtual limit if needed
                         if (this.config.enableTpSl && this.config.limitMode === 'virtual') {
                             this.virtualLimits[finalId] = { tp, sl };
                             this.saveVirtualLimits();
                             console.log(`[AutoTrader] Virtual Limits mapped via WS fallback for Order ${finalId}`);
                         }
                     } else {
                         console.log(`[AutoTrader] WS fallback failed. No unmapped open order found for signal.`);
                     }
                 }, 3000);
            }
        } catch(e: any) {
            console.error(`[AutoTrader] Error executing trade:`, e.response?.data || e.message);
        }
    }
}
