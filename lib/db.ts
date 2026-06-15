import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Company, Filing } from "@/lib/types";

const DATA_DIR = join(process.cwd(), "data");
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
  migrate(db);
  return db;
}

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT UNIQUE,
      name TEXT NOT NULL,
      cik TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS filings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      accessionNumber TEXT NOT NULL UNIQUE,
      formType TEXT NOT NULL,
      filingDate TEXT NOT NULL,
      periodEndDate TEXT,
      secUrl TEXT NOT NULL,
      localPath TEXT NOT NULL,
      title TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    DROP TABLE IF EXISTS filing_sections_fts;
    DROP TABLE IF EXISTS filing_sections;
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

export function insertFiling(input: {
  companyId: number;
  accessionNumber: string;
  formType: string;
  filingDate: string;
  periodEndDate: string | null;
  secUrl: string;
  localPath: string;
  title: string | null;
}): Filing {
  const timestamp = now();
  getDb()
    .prepare(
      `
      INSERT INTO filings (
        companyId, accessionNumber, formType, filingDate, periodEndDate,
        secUrl, localPath, title, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(accessionNumber) DO UPDATE SET
        formType = excluded.formType,
        filingDate = excluded.filingDate,
        periodEndDate = excluded.periodEndDate,
        secUrl = excluded.secUrl,
        localPath = excluded.localPath,
        title = excluded.title,
        updatedAt = excluded.updatedAt
    `
    )
    .run(
      input.companyId,
      input.accessionNumber,
      input.formType,
      input.filingDate,
      input.periodEndDate,
      input.secUrl,
      input.localPath,
      input.title,
      timestamp,
      timestamp
    );

  return getDb()
    .prepare("SELECT * FROM filings WHERE accessionNumber = ?")
    .get(input.accessionNumber) as Filing;
}

export function listFilingsForCompany(companyId: number): Filing[] {
  return getDb()
    .prepare("SELECT * FROM filings WHERE companyId = ? ORDER BY filingDate DESC")
    .all(companyId) as Filing[];
}

export function getFilingWithCompany(filingId: number) {
  const filing = getDb().prepare("SELECT * FROM filings WHERE id = ?").get(filingId) as
    | Filing
    | undefined;
  if (!filing) return null;

  const company = findCompanyById(filing.companyId);

  return { filing, company };
}
