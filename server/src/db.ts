import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { ProbeResult, Report, Endpoint } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "trust-oracle.db");

let db: Database.Database;

// Cached prepared statements
let stmtInsertProbe: Database.Statement;
let stmtInsertReport: Database.Statement;
let stmtUpsertEndpoint: Database.Statement;
let stmtGetEndpoints: Database.Statement;
let stmtGetProbes24h: Database.Statement;
let stmtGetReports: Database.Statement;
let stmtGetRecentProbes: Database.Statement;
let stmtPruneOldProbes: Database.Statement;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("synchronous = NORMAL");
    initSchema(db);
    prepareStatements(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS probes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      success INTEGER NOT NULL,
      latency_ms INTEGER,
      status_code INTEGER,
      error TEXT,
      has_x402 INTEGER NOT NULL DEFAULT 0,
      x402_version INTEGER,
      x402_network TEXT,
      x402_price TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      human_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS endpoints (
      url TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      method TEXT NOT NULL DEFAULT 'GET',
      added_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_probes_url_ts ON probes(url, timestamp);
    CREATE INDEX IF NOT EXISTS idx_probes_ts ON probes(timestamp);
    CREATE INDEX IF NOT EXISTS idx_reports_url ON reports(url);
  `);
}

function prepareStatements(db: Database.Database) {
  stmtInsertProbe = db.prepare(`
    INSERT INTO probes (url, timestamp, success, latency_ms, status_code, error, has_x402, x402_version, x402_network, x402_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmtInsertReport = db.prepare(`
    INSERT INTO reports (url, human_id, rating, comment, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmtUpsertEndpoint = db.prepare(`
    INSERT INTO endpoints (url, name, description, method, added_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      name = COALESCE(excluded.name, endpoints.name),
      description = COALESCE(excluded.description, endpoints.description),
      method = COALESCE(excluded.method, endpoints.method)
  `);

  stmtGetEndpoints = db.prepare("SELECT * FROM endpoints ORDER BY added_at");

  stmtGetProbes24h = db.prepare(`
    SELECT url, timestamp, success, latency_ms, status_code, error
    FROM probes WHERE url = ? AND timestamp > ? ORDER BY timestamp DESC
  `);

  stmtGetReports = db.prepare(`
    SELECT url, human_id, rating, comment, timestamp
    FROM reports WHERE url = ? ORDER BY timestamp DESC
  `);

  stmtGetRecentProbes = db.prepare(`
    SELECT url, timestamp, success, latency_ms, status_code, error
    FROM probes ORDER BY timestamp DESC LIMIT ?
  `);

  stmtPruneOldProbes = db.prepare(`
    DELETE FROM probes WHERE timestamp < ?
  `);
}

export function insertProbe(probe: ProbeResult) {
  stmtInsertProbe.run(
    probe.url, probe.timestamp, probe.success ? 1 : 0,
    probe.latency_ms, probe.status_code, probe.error,
    probe.has_x402 ? 1 : 0, probe.x402_version, probe.x402_network, probe.x402_price
  );
}

export function insertReport(report: Report) {
  stmtInsertReport.run(
    report.url, report.human_id, report.rating,
    report.comment, report.timestamp
  );
}

export function upsertEndpoint(endpoint: Endpoint) {
  stmtUpsertEndpoint.run(
    endpoint.url, endpoint.name, endpoint.description, endpoint.method, endpoint.added_at
  );
}

export function getEndpoints(): Endpoint[] {
  return stmtGetEndpoints.all() as Endpoint[];
}

export function getProbes24h(url: string): ProbeResult[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return stmtGetProbes24h.all(url, cutoff) as ProbeResult[];
}

export function getReports(url: string): Report[] {
  return stmtGetReports.all(url) as Report[];
}

export function getRecentProbes(limit: number = 50): ProbeResult[] {
  return stmtGetRecentProbes.all(limit) as ProbeResult[];
}

// Remove probes older than 7 days to prevent unbounded growth
export function pruneOldProbes() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const result = stmtPruneOldProbes.run(cutoff);
  if (result.changes > 0) {
    console.log(`[db] Pruned ${result.changes} old probes`);
  }
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
