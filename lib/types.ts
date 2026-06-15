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
