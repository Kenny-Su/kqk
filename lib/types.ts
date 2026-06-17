export type Company = {
  id: number;
  ticker: string | null;
  name: string;
  cik: string;
  createdAt: string;
  updatedAt: string;
};

export type RecentSecFiling = {
  accessionNumber: string;
  formType: string;
  filingDate: string;
  periodEndDate: string | null;
  primaryDocument: string;
  secUrl: string;
  title: string | null;
};

export type FinancialPeriod = "annual" | "quarterly";
export type FinancialStatement = "income" | "balance" | "cashFlow";

export type FinancialDataPoint = {
  start: string | null;
  end: string;
  filed: string;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  form: string;
  accessionNumber: string | null;
  value: number;
  warnings: string[];
  tag: string;
  unit: "USD";
};

export type FinancialMetric = {
  key: string;
  label: string;
  statement: FinancialStatement;
  unit: "USD";
  annual: FinancialDataPoint[];
  quarterly: FinancialDataPoint[];
  warnings: string[];
};

export type FinancialFactsResponse = {
  company: Company;
  sourceUrl: string;
  cachedAt: string;
  metrics: FinancialMetric[];
};
