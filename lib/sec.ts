import "server-only";

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeFinancialMetrics,
  type CompanyFactsResponse
} from "@/lib/financial-facts";
import { DATA_DIR } from "@/lib/paths";
import type { FinancialMetric, RecentSecFiling } from "@/lib/types";

type CompanyTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SubmissionsResponse = {
  cik: string;
  name: string;
  tickers?: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
};

const SEC_BASE = "https://www.sec.gov";
const SEC_DATA_BASE = "https://data.sec.gov";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function cachePath(...parts: string[]) {
  return join(DATA_DIR, "sec-cache", ...parts);
}

async function secFetch(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`SEC request failed (${response.status}) for ${url}`);
  }

  return response;
}

export async function resolveCompany(identifier: string) {
  const normalized = identifier.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker or CIK.");
  }

  if (/^\d+$/.test(normalized)) {
    const cik = normalized.padStart(10, "0");
    const submissions = await fetchSubmissions(cik);
    return {
      ticker: submissions.tickers?.[0] ?? null,
      name: submissions.name,
      cik
    };
  }

  const response = await secFetch(`${SEC_BASE}/files/company_tickers.json`);
  const data = (await response.json()) as Record<string, CompanyTickerEntry>;
  const entry = Object.values(data).find((candidate) => candidate.ticker === normalized);

  if (!entry) {
    throw new Error(`Could not find SEC company for ticker ${normalized}.`);
  }

  return {
    ticker: entry.ticker,
    name: entry.title,
    cik: String(entry.cik_str).padStart(10, "0")
  };
}

export async function fetchSubmissions(cik: string): Promise<SubmissionsResponse> {
  const response = await secFetch(`${SEC_DATA_BASE}/submissions/CIK${cik}.json`);
  return (await response.json()) as SubmissionsResponse;
}

export async function getRecentFilings(cik: string): Promise<RecentSecFiling[]> {
  const submissions = await fetchSubmissions(cik);
  const recent = submissions.filings.recent;
  const wantedForms = new Set(["10-K", "10-Q", "8-K"]);

  return recent.accessionNumber
    .map((accessionNumber, index) => {
      const primaryDocument = recent.primaryDocument[index];
      return {
        accessionNumber,
        formType: recent.form[index],
        filingDate: recent.filingDate[index],
        periodEndDate: recent.reportDate[index] || null,
        primaryDocument,
        secUrl: filingSecUrl({
          cik,
          accessionNumber,
          primaryDocument
        }),
        title: recent.primaryDocDescription[index] || null
      };
    })
    .filter((filing) => wantedForms.has(filing.formType))
    .slice(0, 20);
}

export function filingSecUrl(input: {
  cik: string;
  accessionNumber: string;
  primaryDocument: string;
}) {
  const compactAccession = input.accessionNumber.replace(/-/g, "");
  const cikNumber = String(Number(input.cik));
  return `${SEC_BASE}/Archives/edgar/data/${cikNumber}/${compactAccession}/${input.primaryDocument}`;
}

export async function getCompanyFinancialFacts(input: {
  cik: string;
  force?: boolean;
}): Promise<{ cachedAt: string; metrics: FinancialMetric[]; sourceUrl: string }> {
  const sourceUrl = `${SEC_DATA_BASE}/api/xbrl/companyfacts/CIK${input.cik}.json`;
  const cacheFilePath = cachePath(input.cik, "companyfacts.json");

  mkdirSync(join(DATA_DIR, "sec-cache", input.cik), { recursive: true });

  let raw: string;
  try {
    if (input.force) {
      throw new Error("Force refresh requested.");
    }
    raw = readFileSync(cacheFilePath, "utf8");
  } catch {
    const response = await secFetch(sourceUrl);
    raw = await response.text();
    writeFileSync(cacheFilePath, raw, "utf8");
  }

  const cachedAt = statSync(cacheFilePath).mtime.toISOString();
  const data = JSON.parse(raw) as CompanyFactsResponse;

  return {
    cachedAt,
    metrics: normalizeFinancialMetrics(data),
    sourceUrl
  };
}
