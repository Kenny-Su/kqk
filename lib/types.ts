export type Company = {
  id: number;
  ticker: string | null;
  name: string;
  cik: string;
  createdAt: string;
  updatedAt: string;
};

export type Filing = {
  id: number;
  companyId: number;
  accessionNumber: string;
  formType: string;
  filingDate: string;
  periodEndDate: string | null;
  secUrl: string;
  localPath: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecentSecFiling = {
  accessionNumber: string;
  formType: string;
  filingDate: string;
  periodEndDate: string | null;
  primaryDocument: string;
  title: string | null;
};

export type FinancialPeriod = "annual" | "quarterly";
export type FinancialPointSource = "reported" | "derived";
export type FinancialPointQuality = "high" | "derived" | "caution";
export type FinancialStatement = "income" | "balance" | "cashFlow";
export type FinancialMetricImportance = "foundation";
export type FinancialMetricReliability = "high";

export type FinancialDataPoint = {
  start: string | null;
  end: string;
  filed: string;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  form: string;
  accessionNumber: string | null;
  value: number;
  source: FinancialPointSource;
  quality: FinancialPointQuality;
  warnings: string[];
  tag: string;
  unit: "USD";
};

export type FinancialMetric = {
  key: string;
  label: string;
  statement: FinancialStatement;
  importance: FinancialMetricImportance;
  reliability: FinancialMetricReliability;
  description: string;
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
