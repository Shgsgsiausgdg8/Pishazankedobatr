import React, { useEffect, useRef, useState } from 'react';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Level {
  price: number;
  type: 'RESISTANCE' | 'SUPPORT';
}

interface CandlestickChartProps {
  data: Candle[];
  levels: Level[];
  nPattern?: any;
  originalCandlesCount?: number;
  activeStrategy?: string;
  height?: string | number;
}

const CandlestickChart = ({ data, levels, nPattern, originalCandlesCount, activeStrategy, height = '420px' }: CandlestickChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewState, setViewState] = useState({ offset: 0, zoom: 1, followLatest: true });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, active: false });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0 || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Default background even if no data
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    if (data.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Vazirmatn, Inter';
      ctx.textAlign = 'center';
      ctx.fillText('در حال دریافت اطلاعات چارت...', width / 2, height / 2);
      return;
    }

    const paddingRight = 60;
    const paddingTop = 20;
    const paddingBottom = 30;
    const chartWidth = width - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const baseCandleWidth = 10;
    const candleWidth = baseCandleWidth * viewState.zoom;
    
    let currentOffset = viewState.offset;
    if (viewState.followLatest) {
      currentOffset = chartWidth - (data.length * candleWidth);
    }

    const startIdx = Math.max(0, Math.floor(-currentOffset / candleWidth));
    const endIdx = Math.min(data.length, Math.ceil((chartWidth - currentOffset) / candleWidth));
    const visibleData = data.slice(startIdx, endIdx);

    // Scaling based on visible data or full data if visible is empty
    const scaleData = visibleData.length > 0 ? visibleData : data;
    const prices = scaleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = (maxPrice - minPrice) || 100;
    const yBuffer = priceRange * 0.15;
    const displayMin = minPrice - yBuffer;
    const displayMax = maxPrice + yBuffer;
    const displayRange = (displayMax - displayMin) || 1;

    const getX = (index: number) => Math.floor(currentOffset + (index * candleWidth));
    const getY = (price: number) => paddingTop + chartHeight - ((price - displayMin) / displayRange) * chartHeight;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px JetBrains Mono';

    const gridLines = 8;
    for (let i = 0; i <= gridLines; i++) {
        const y = Math.round(paddingTop + (i / gridLines) * chartHeight);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();

        const priceValue = displayMax - (i / gridLines) * displayRange;
        ctx.fillText(priceValue.toLocaleString(undefined, { minimumFractionDigits: 1 }), chartWidth + 5, y + 4);
    }

    if (visibleData.length === 0) {
        ctx.setLineDash([]);
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'center';
        ctx.font = '12px Vazirmatn';
        ctx.fillText('در حال تنظیم محدوده قیمت (یا دیتای این بازه موجود نیست)...', chartWidth / 2, chartHeight / 2);
        return;
    }

    const timeLabelsCount = 5;
    const interval = Math.max(1, Math.floor((endIdx - startIdx) / timeLabelsCount));
    
    for (let i = startIdx; i < endIdx; i++) {
        if ((i - startIdx) % interval === 0) {
            const x = getX(i);
            const candle = data[i];
            if (candle && x < chartWidth) {
                ctx.beginPath();
                ctx.moveTo(x, paddingTop);
                ctx.lineTo(x, paddingTop + chartHeight);
                ctx.stroke();
                
                const timeStr = new Date(candle.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                ctx.fillText(timeStr, x - 15, height - 10);
            }
        }
    }
    ctx.setLineDash([]);

    levels.forEach(level => {
      if (level.price >= displayMin && level.price <= displayMax) {
        const y = Math.round(getY(level.price));
        ctx.strokeStyle = level.type === 'RESISTANCE' ? 'rgba(239, 68, 68, 0.45)' : 'rgba(16, 185, 129, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();
        
        ctx.fillStyle = level.type === 'RESISTANCE' ? '#ef4444' : '#10b981';
        ctx.font = '8px Inter';
        ctx.fillText(level.price.toFixed(1), chartWidth - 35, y - 4);
      }
    });

    visibleData.forEach((d, i) => {
      const x = getX(startIdx + i);
      const openY = getY(d.open);
      const closeY = getY(d.close);
      const highY = getY(d.high);
      const lowY = getY(d.low);

      const isUp = d.close >= d.open;
      ctx.strokeStyle = isUp ? '#10b981' : '#ef4444';
      ctx.fillStyle = isUp ? '#10b981' : '#ef4444';
      
      ctx.lineWidth = Math.max(1, candleWidth * 0.1);
      ctx.beginPath();
      ctx.moveTo(x, Math.round(highY));
      ctx.lineTo(x, Math.round(lowY));
      ctx.stroke();

      const bWidth = Math.max(2, candleWidth * 0.8);
      const bodyTop = Math.round(Math.min(openY, closeY));
      const bodyBottom = Math.round(Math.max(openY, closeY));
      const bHeight = Math.max(1, bodyBottom - bodyTop);
      
      if (bWidth < 3) {
          ctx.beginPath();
          ctx.moveTo(x, bodyTop);
          ctx.lineTo(x, bodyBottom);
          ctx.stroke();
      } else {
          ctx.fillRect(Math.round(x - bWidth / 2), bodyTop, Math.round(bWidth), bHeight);
      }
    });

    if (mousePos.active && mousePos.x < chartWidth) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0); ctx.lineTo(mousePos.x, height);
      ctx.moveTo(0, mousePos.y); ctx.lineTo(width, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      const priceAtMouse = displayMax - ((mousePos.y - paddingTop) / chartHeight) * displayRange;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(chartWidth, mousePos.y - 10, 60, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(Math.round(priceAtMouse).toLocaleString(), chartWidth + 5, mousePos.y + 4);
    }

    const lastCandle = data[data.length - 1];
    if (lastCandle && lastCandle.close >= displayMin && lastCandle.close <= displayMax) {
      const y = getY(lastCandle.close);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(chartWidth, y - 10, 60, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px JetBrains Mono';
      ctx.fillText(Math.round(lastCandle.close).toLocaleString(), chartWidth + 5, y + 4);
    }

    if (nPattern && nPattern.points && nPattern.points.length >= 2) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, chartWidth, height);
      ctx.clip();
      
      const isConfirmed = nPattern.isConfirmed;
      ctx.strokeStyle = nPattern.type === 'BUY' ? '#10b981' : '#ef4444';
      ctx.lineWidth = isConfirmed ? 5 : 2.5; 
      
      if (!isConfirmed) ctx.setLineDash([8, 4]);
      else {
        ctx.setLineDash([]);
        ctx.shadowBlur = 15;
        ctx.shadowColor = nPattern.type === 'BUY' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      }
      
      const lastTime = data[data.length - 1].time;
      const firstTime = data[0].time;
      const candleInterval = data.length > 1 ? data[1].time - data[0].time : 60000;

      ctx.beginPath();
      let drewFirst = false;
      nPattern.points.forEach((p: any) => {
        const cIdx = data.findIndex(c => c.time === p.time);
        let x = NaN;
        if (cIdx !== -1) x = getX(cIdx);
        else {
          const offset = (p.time - lastTime) / candleInterval;
          x = getX(data.length - 1 + offset);
        }
        const y = getY(p.price);
        if (Number.isNaN(x) || Number.isNaN(y)) return;
        if (!drewFirst) { ctx.moveTo(x, y); drewFirst = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

  }, [data, levels, nPattern, viewState, mousePos, dimensions]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouseX.current = e.clientX;
    setViewState(prev => ({ ...prev, followLatest: false }));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y, active: true });
    if (isDragging.current) {
      const deltaX = e.clientX - lastMouseX.current;
      setViewState(prev => ({ ...prev, offset: prev.offset + deltaX }));
      lastMouseX.current = e.clientX;
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="chart-container"
      style={{ height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={() => { isDragging.current = false; }}
      onMouseLeave={() => { isDragging.current = false; setMousePos(p => ({ ...p, active: false })); }}
      onWheel={(e) => {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setViewState(prev => ({ ...prev, zoom: Math.max(0.1, Math.min(5, prev.zoom * zoomFactor)) }));
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: isDragging.current ? 'grabbing' : 'crosshair' }} />
      {!viewState.followLatest && (
        <button 
          onClick={() => setViewState(v => ({ ...v, followLatest: true }))}
          style={{ position: 'absolute', bottom: '40px', right: '70px', background: '#10b981', color: 'white', border: 'none', borderRadius: '20px', padding: '4px 12px', fontSize: '0.7rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
        >
          بازگشت به قیمت زنده
        </button>
      )}
    </div>
  );
};

export default CandlestickChart;
