import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

let db: any = null;

// Initialize sql.js asynchronously
const SQL = await initSqlJs();
const dbPath = path.join(process.cwd(), 'history.sqlite');

try {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
} catch (e) {
    db = new SQL.Database();
}

db.run(`
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
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    );
`);
// Only save if it was just created is not strictly needed since sql.js runs in memory,
// but we should probably save just in case it added tables.
fs.writeFileSync(dbPath, Buffer.from(db.export()));

let saveTimeout: any = null;

function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            const data = db.export();
            fs.writeFileSync(dbPath, Buffer.from(data));
        } catch (e) {
            console.error('[DB] Save error:', e);
        }
    }, 5000);
}

/**
 * Saves or updates a setting in the database.
 */
export function setSetting(key: string, value: any) {
    try {
        db.run("BEGIN TRANSACTION;");
        const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        stmt.run([key, JSON.stringify(value)]);
        stmt.free();
        db.run("COMMIT;");
        scheduleSave();
    } catch (e) {
        console.error(`[DB] Error saving setting ${key}:`, e);
    }
}

/**
 * Loads a setting from the database.
 */
export function getSetting(key: string): any {
    try {
        const stmt = db.prepare("SELECT value FROM settings WHERE key = ?");
        stmt.bind([key]);
        let result = null;
        if (stmt.step()) {
            const row = stmt.getAsObject();
            if (row.value) {
                result = JSON.parse(row.value as string);
            }
        }
        stmt.free();
        return result;
    } catch (e) {
        console.error(`[DB] Error loading setting ${key}:`, e);
        return null;
    }
}

/**
 * User management functions
 */
export function getUser(username: string): any {
    try {
        const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
        stmt.bind([username]);
        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        return result;
    } catch(e) {
        return null;
    }
}

export function createUser(username: string, passwordHash: string): boolean {
    try {
        db.run("BEGIN TRANSACTION;");
        const stmt = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)");
        stmt.run([username, passwordHash]);
        stmt.free();
        db.run("COMMIT;");
        scheduleSave();
        return true;
    } catch(e) {
        db.run("ROLLBACK;");
        return false;
    }
}

export function getUserCount(): number {
    try {
        const stmt = db.prepare("SELECT COUNT(*) as c FROM users");
        let result = 0;
        if (stmt.step()) {
            result = stmt.getAsObject().c as number;
        }
        stmt.free();
        return result;
    } catch(e) {
        return 0;
    }
}


/**
 * Saves multiple candles into the SQLite database for a specific broker and timeframe.
 */
export function saveCandles(broker: string, timeframe: string, candles: any[]) {
    if (!candles || candles.length === 0) return;
    
    db.run("BEGIN TRANSACTION;");
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO candles (broker, timeframe, time, open, high, low, close)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
        for (const item of candles) {
            stmt.run([broker, timeframe, item.time, item.open, item.high, item.low, item.close]);
        }
    } catch (e) {
        console.error(`[DB] Error saving candles for ${broker}:`, e);
    } finally {
        stmt.free();
        db.run("COMMIT;");
        scheduleSave();
    }
}

/**
 * Loads recent historical candles from the database up to a specific limit.
 */
export function getCandles(broker: string, timeframe: string, limit: number = 2000): any[] {
    try {
        const stmt = db.prepare(`
            SELECT time, open, high, low, close 
            FROM candles 
            WHERE broker = ? AND timeframe = ? 
            ORDER BY time DESC 
            LIMIT ?
        `);
        stmt.bind([broker, timeframe, limit]);
        
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        
        // Reverse because we want oldest to newest for charts
        return rows.reverse();
    } catch (e) {
        console.error(`[DB] Error loading candles for ${broker}:`, e);
        return [];
    }
}

export default db;
