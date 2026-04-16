/**
 * FarazGold Trading Strategy
 * This file is designed to be easily editable by a trader.
 * Logic: RSI + EMA
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Signal {
  type: 'BUY' | 'SELL';
  entry: number;
  tp1: number;
  tp2: number;
  tp3: number;
  sl: number;
  time: number;
  timeframe: string;
}

export class TradingStrategy {
  // --- CONFIGURATION ---
  private rsiPeriod = 14;
  private emaPeriod = 20;
  
  // Scalp Settings (1m, 2m)
  private scalpRsiOverbought = 70;
  private scalpRsiOversold = 30;
  
  // Trend Settings (5m)
  private trendRsiThreshold = 50;
  
  // Risk Management (in Ticks/Price units)
  private tp1Ticks = 15;
  private tp2Ticks = 30;
  private tp3Ticks = 50;
  private slTicks = 20;

  /**
   * Main analysis function
   */
  analyze(candles: Candle[], timeframe: string): Signal | null {
    if (candles.length < Math.max(this.rsiPeriod, this.emaPeriod) + 5) return null;

    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const rsi = this.calculateRSI(closes, this.rsiPeriod);
    const ema = this.calculateEMA(closes, this.emaPeriod);
    
    const lastRsi = rsi[rsi.length - 1];
    const lastEma = ema[ema.length - 1];

    // Determine Mode
    const isScalp = timeframe === '1' || timeframe === '2';
    const isTrend = timeframe === '5';

    if (isScalp) {
      // SCALP STRATEGY: RSI Reversal + EMA Confirmation
      // BUY: RSI was oversold and price is above EMA
      if (lastRsi < this.scalpRsiOversold && currentPrice > lastEma) {
        return this.createSignal('BUY', currentPrice, timeframe);
      }
      // SELL: RSI was overbought and price is below EMA
      if (lastRsi > this.scalpRsiOverbought && currentPrice < lastEma) {
        return this.createSignal('SELL', currentPrice, timeframe);
      }
    } 
    
    if (isTrend) {
      // TREND STRATEGY: EMA Direction + RSI Strength
      // BUY: Price above EMA and RSI above 50
      if (currentPrice > lastEma && lastRsi > this.trendRsiThreshold) {
        return this.createSignal('BUY', currentPrice, timeframe);
      }
      // SELL: Price below EMA and RSI below 50
      if (currentPrice < lastEma && lastRsi < this.trendRsiThreshold) {
        return this.createSignal('SELL', currentPrice, timeframe);
      }
    }

    return null;
  }

  private createSignal(type: 'BUY' | 'SELL', price: number, timeframe: string): Signal {
    const direction = type === 'BUY' ? 1 : -1;
    return {
      type,
      entry: price,
      sl: price - (this.slTicks * direction * -1), // SL is opposite to direction
      tp1: price + (this.tp1Ticks * direction),
      tp2: price + (this.tp2Ticks * direction),
      tp3: price + (this.tp3Ticks * direction),
      time: Date.now(),
      timeframe
    };
  }

  // --- TECHNICAL INDICATORS ---

  private calculateEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    let ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
      ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }

  private calculateRSI(data: number[], period: number): number[] {
    let rsi = [];
    let gains = [];
    let losses = [];

    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      gains.push(Math.max(0, diff));
      losses.push(Math.max(0, -diff));
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;

    for (let i = period; i < data.length; i++) {
      const rs = avgGain / (avgLoss || 1);
      rsi.push(100 - (100 / (1 + rs)));

      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    return rsi;
  }
}
