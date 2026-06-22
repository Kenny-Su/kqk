import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "@/lib/paths";
import type { Company } from "@/lib/types";

const DB_PATH = join(DATA_DIR, "kqk.sqlite");

let db: DatabaseSync | null = null;

function now() {
  return new Date().toISOString();
}

export function getDb() {
  if (db) return db;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  initializeSchema(db);
  return db;
}

function initializeSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT UNIQUE,
      name TEXT NOT NULL,
      cik TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
}

export function listCompanies(): Company[] {
  return getDb()
    .prepare("SELECT * FROM companies ORDER BY ticker IS NULL, ticker, name")
    .all() as Company[];
}

export function findCompanyById(id: number): Company | undefined {
  return getDb().prepare("SELECT * FROM companies WHERE id = ?").get(id) as
    | Company
    | undefined;
}

export function deleteCompanyById(id: number) {
  getDb().prepare("DELETE FROM companies WHERE id = ?").run(id);
}

export function upsertCompany(input: {
  ticker: string | null;
  name: string;
  cik: string;
}): Company {
  const timestamp = now();
  getDb()
    .prepare(
      `
      INSERT INTO companies (ticker, name, cik, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(cik) DO UPDATE SET
        ticker = excluded.ticker,
        name = excluded.name,
        updatedAt = excluded.updatedAt
    `
    )
    .run(input.ticker, input.name, input.cik, timestamp, timestamp);

  return getDb().prepare("SELECT * FROM companies WHERE cik = ?").get(input.cik) as Company;
}
