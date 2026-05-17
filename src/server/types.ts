export interface Candle {
  // Candle data structure
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Signal {
  type: 'BUY' | 'SELL';
  entry: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4?: number;
  tp5?: number;
  tp6?: number;
  tp7?: number;
  sl: number;
  time: number;
  timeframe: string;
  kaf?: number;
  saghf?: number;
  confidence?: number;
  // Strategy specific fields
  priority?: number;
  signalQuality?: string;
  signalStrength?: string;
  signalType?: string;
  rsi?: number;
  isSecondEntry?: boolean;
  activeLevel?: number;
  riskPercent?: number;
  pipsToTP1?: number;
  pipsToTP2?: number;
  pipsToTP3?: number;
  pipsToTP4?: number;
  pipsToTP5?: number;
  riskPips?: number;
  trendAnalysis?: any;
  [key: string]: any;
}

export interface StrategyConfig {
    smaPeriod: number;
    nMinPullback: number;
    nMaxPullback: number;
    nReversalThreshold: number;
    fibLookback: number;
    fibMinRange: number;
    strategy3Strictness: 'low' | 'medium' | 'high';
    customKaf?: number;
    customSaghf?: number;
}
