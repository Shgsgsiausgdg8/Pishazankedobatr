import Database from 'better-sqlite3';

const db = new Database('history.db', { verbose: undefined });

// Enable optimal performance
db.pragma('journal_mode = WAL'); // Write-Ahead Logging for concurrency
db.pragma('synchronous = NORMAL'); 

db.exec(`
  CREATE TABLE IF NOT EXISTS candles (
    broker TEXT,
    timeframe TEXT,
    time INTEGER,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    PRIMARY KEY (broker, timeframe, time)
  );
`);

/**
 * Saves multiple candles into the SQLite database for a specific broker and timeframe.
 */
export function saveCandles(broker: string, timeframe: string, candles: any[]) {
    if (!candles || candles.length === 0) return;
    
    // We use a transaction for batch insert which is incredibly fast
    const insert = db.prepare(`
        INSERT OR REPLACE INTO candles (broker, timeframe, time, open, high, low, close)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items: any[]) => {
        for (const item of items) {
            insert.run(broker, timeframe, item.time, item.open, item.high, item.low, item.close);
        }
    });

    try {
        insertMany(candles);
    } catch (e) {
        console.error(`[DB] Error saving candles for ${broker}:`, e);
    }
}

/**
 * Loads recent historical candles from the database up to a specific limit.
 */
export function getCandles(broker: string, timeframe: string, limit: number = 2000): any[] {
    try {
        const rows = db.prepare(`
            SELECT time, open, high, low, close 
            FROM candles 
            WHERE broker = ? AND timeframe = ? 
            ORDER BY time DESC 
            LIMIT ?
        `).all(broker, timeframe, limit);
        
        // Reverse because we want oldest to newest for charts
        return rows.reverse();
    } catch (e) {
        console.error(`[DB] Error loading candles for ${broker}:`, e);
        return [];
    }
}

export default db;
