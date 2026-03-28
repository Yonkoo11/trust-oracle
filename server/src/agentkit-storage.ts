import { getDb } from "./db.js";

// SQLite-backed AgentKit storage so free-trial counters survive restarts.

interface AgentKitStorage {
  getUsageCount(endpoint: string, humanId: string): Promise<number>;
  incrementUsage(endpoint: string, humanId: string): Promise<void>;
  hasUsedNonce?(nonce: string): Promise<boolean>;
  recordNonce?(nonce: string): Promise<void>;
}

export class SqliteAgentKitStorage implements AgentKitStorage {
  private initialized = false;

  private ensureTable() {
    if (this.initialized) return;
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS agentkit_usage (
        endpoint TEXT NOT NULL,
        human_id TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (endpoint, human_id)
      );
      CREATE TABLE IF NOT EXISTS agentkit_nonces (
        nonce TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
    `);
    this.initialized = true;
  }

  async getUsageCount(endpoint: string, humanId: string): Promise<number> {
    this.ensureTable();
    const row = getDb().prepare(
      "SELECT count FROM agentkit_usage WHERE endpoint = ? AND human_id = ?"
    ).get(endpoint, humanId) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  async incrementUsage(endpoint: string, humanId: string): Promise<void> {
    this.ensureTable();
    getDb().prepare(`
      INSERT INTO agentkit_usage (endpoint, human_id, count) VALUES (?, ?, 1)
      ON CONFLICT(endpoint, human_id) DO UPDATE SET count = count + 1
    `).run(endpoint, humanId);
  }

  async hasUsedNonce(nonce: string): Promise<boolean> {
    this.ensureTable();
    const row = getDb().prepare(
      "SELECT 1 FROM agentkit_nonces WHERE nonce = ?"
    ).get(nonce);
    return !!row;
  }

  async recordNonce(nonce: string): Promise<void> {
    this.ensureTable();
    getDb().prepare(
      "INSERT OR IGNORE INTO agentkit_nonces (nonce, created_at) VALUES (?, ?)"
    ).run(nonce, Date.now());
  }
}
