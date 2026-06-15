"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Company, Filing, RecentSecFiling } from "@/lib/types";

type FilingDetail = {
  filing: Filing;
  company?: Company;
};

export function KqkApp() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [recentFilings, setRecentFilings] = useState<RecentSecFiling[]>([]);
  const [cachedFilings, setCachedFilings] = useState<Filing[]>([]);
  const [filingDetail, setFilingDetail] = useState<FilingDetail | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState("Ready.");
  const [loading, setLoading] = useState(false);

  const filingChoices = useMemo(() => {
    const cachedByAccession = new Map(
      cachedFilings.map((filing) => [filing.accessionNumber, filing])
    );
    const recentAccessions = new Set(recentFilings.map((filing) => filing.accessionNumber));
    const recentChoices = recentFilings.map((filing) => ({
      key: filing.accessionNumber,
      formType: filing.formType,
      filingDate: filing.filingDate,
      title: filing.title ?? filing.primaryDocument,
      cached: cachedByAccession.get(filing.accessionNumber) ?? null,
      recent: filing
    }));
    const cachedOnlyChoices = cachedFilings
      .filter((filing) => !recentAccessions.has(filing.accessionNumber))
      .map((filing) => ({
        key: filing.accessionNumber,
        formType: filing.formType,
        filingDate: filing.filingDate,
        title: filing.title ?? filing.accessionNumber,
        cached: filing,
        recent: null
      }));

    return [...recentChoices, ...cachedOnlyChoices].sort((a, b) =>
      b.filingDate.localeCompare(a.filingDate)
    );
  }, [cachedFilings, recentFilings]);

  const localHtmlUrl = filingDetail ? `/api/filings/${filingDetail.filing.id}/html` : "";

  useEffect(() => {
    void loadCompanies();
  }, []);

  async function loadCompanies() {
    const response = await fetch("/api/companies");
    const data = await response.json();
    setCompanies(data.companies ?? []);
  }

  async function loadCompany(id: number) {
    const response = await fetch(`/api/companies/${id}`);
    const data = await response.json();
    setSelectedCompanyId(id);
    setCachedFilings(data.filings ?? []);
    setRecentFilings([]);
    setFilingDetail(null);
    setStatus("Company selected. Fetch recent SEC filings next.");
  }

  async function deleteCompany(company: Company) {
    const label = company.ticker ?? company.name;
    if (!window.confirm(`Delete ${label} and all cached filings?`)) return;

    setLoading(true);
    setStatus(`Deleting ${label}...`);
    try {
      const response = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (selectedCompanyId === company.id) {
        setSelectedCompanyId(null);
        setRecentFilings([]);
        setCachedFilings([]);
        setFilingDetail(null);
      }
      await loadCompanies();
      setStatus(`${label} deleted.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete company.");
    } finally {
      setLoading(false);
    }
  }

  async function addCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("Looking up company on SEC...");
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setIdentifier("");
      await loadCompanies();
      await loadCompany(data.company.id);
      await fetchRecentFilings(data.company.id, { openLatest: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add company.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecentFilings(
    companyId = selectedCompanyId,
    options: { openLatest?: boolean } = {}
  ) {
    if (!companyId) return;
    setStatus("Fetching recent SEC filing list...");
    try {
      const response = await fetch(`/api/companies/${companyId}/sec-filings`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const filings = (data.filings ?? []) as RecentSecFiling[];
      setRecentFilings(filings);

      if (options.openLatest && filings[0]) {
        setStatus("Fetching latest filing from SEC...");
        const filing = await cacheFiling(filings[0], { companyId, force: true });
        await refreshCachedFilings(companyId);
        await openFiling(filing.id);
        setStatus("Latest filing cached and opened.");
      } else {
        setStatus(`Found ${filings.length} recent SEC filings.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not fetch SEC filing list.");
    }
  }

  async function handleFetchRecent() {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      setStatus("Fetching recent SEC filing list...");
      const response = await fetch(`/api/companies/${selectedCompanyId}/sec-filings`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const filings = (data.filings ?? []) as RecentSecFiling[];
      setRecentFilings(filings);

      let latestFiling: Filing | null = null;
      for (const [index, filing] of filings.entries()) {
        setStatus(`Refreshing ${index + 1} of ${filings.length}: ${filing.formType} ${filing.filingDate}...`);
        const cached = await cacheFiling(filing, { companyId: selectedCompanyId, force: true });
        latestFiling ??= cached;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      await refreshCachedFilings(selectedCompanyId);
      if (latestFiling) {
        await openFiling(latestFiling.id);
      }
      setStatus(`Refreshed ${filings.length} recent filings.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not refresh recent filings.");
    } finally {
      setLoading(false);
    }
  }

  async function cacheFiling(
    filing: RecentSecFiling,
    options: { companyId?: number; force?: boolean } = {}
  ): Promise<Filing> {
    const companyId = options.companyId ?? selectedCompanyId;
    if (!companyId) throw new Error("Choose a company first.");
    setStatus(
      `${options.force ? "Refreshing" : "Fetching"} ${filing.formType} filed ${filing.filingDate} from SEC...`
    );
    const response = await fetch(`/api/companies/${companyId}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...filing, force: options.force })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data.filing as Filing;
  }

  async function cacheAndOpenFiling(
    filing: RecentSecFiling,
    options: { companyId?: number; force?: boolean } = {}
  ) {
    const companyId = options.companyId ?? selectedCompanyId;
    if (!companyId) return;
    const cached = await cacheFiling(filing, options);
    await refreshCachedFilings(companyId);
    await openFiling(cached.id);
    setStatus(options.force ? "Cached filing refreshed and opened." : "Filing cached and opened.");
  }

  async function refreshCachedFilings(companyId: number) {
    const response = await fetch(`/api/companies/${companyId}`);
    const data = await response.json();
    setCachedFilings(data.filings ?? []);
  }

  async function openFiling(filingId: number) {
    const response = await fetch(`/api/filings/${filingId}`);
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error ?? "Could not open filing.");
      return;
    }
    setFilingDetail(data);
    setStatus("Filing open.");
  }

  async function openOrFetchFiling(choice: {
    cached: Filing | null;
    recent: RecentSecFiling | null;
  }) {
    if (choice.cached) {
      await openFiling(choice.cached.id);
      return;
    }

    if (choice.recent) {
      setLoading(true);
      try {
        await cacheAndOpenFiling(choice.recent);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not fetch filing.");
      } finally {
        setLoading(false);
      }
    }
  }

  function formatCacheTime(value: string) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function filingTitle(choice: { formType: string; title: string }) {
    const normalizedTitle = choice.title.trim().toLowerCase();
    const normalizedForm = choice.formType.trim().toLowerCase();

    if (
      normalizedTitle === normalizedForm ||
      normalizedTitle === `form ${normalizedForm}` ||
      normalizedTitle === `${normalizedForm} filing`
    ) {
      return null;
    }

    return choice.title;
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SEC Filing Viewer</p>
          <h1>KQK</h1>
        </div>
        <p className="status">{loading ? "Working..." : status}</p>
      </header>

      <section className="grid two">
        <div className="panel">
          <h2>1. Add Company</h2>
          <form className="row" onSubmit={addCompany}>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Ticker or CIK, e.g. AAPL"
            />
            <button disabled={loading}>Add</button>
          </form>

          <div className="list">
            {companies.map((company) => (
              <div className="companyRow" key={company.id}>
                <button
                  className={company.id === selectedCompanyId ? "listItem active" : "listItem"}
                  onClick={() => loadCompany(company.id)}
                  type="button"
                >
                  <strong>{company.ticker ?? company.cik}</strong>
                  <span>{company.name}</span>
                </button>
                <button
                  className="secondaryButton"
                  disabled={loading}
                  onClick={() => deleteCompany(company)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h2>2. Choose Filing</h2>
            <button disabled={!selectedCompanyId || loading} onClick={handleFetchRecent}>
              Refresh Recent
            </button>
          </div>
          <div className="list compact">
            {filingChoices.length === 0 ? (
              <p className="muted">Select a company, then fetch recent 10-K, 10-Q, and 8-K filings.</p>
            ) : null}
            {filingChoices.map((choice) => (
              <button
                className={choice.cached?.id === filingDetail?.filing.id ? "listItem active" : "listItem"}
                key={choice.key}
                onClick={() => openOrFetchFiling(choice)}
                type="button"
              >
                <strong>
                  {choice.formType} · {choice.filingDate}
                </strong>
                {filingTitle(choice) ? <span>{filingTitle(choice)}</span> : null}
                <span>
                  {choice.cached
                    ? `Cached ${formatCacheTime(choice.cached.updatedAt)}`
                    : "Not cached"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {filingDetail ? (
        <section className="viewer">
          <div className="viewerHeader">
            <div>
              <p className="eyebrow">
                {filingDetail.company?.ticker ?? "Company"} · {filingDetail.filing.formType}
              </p>
              <h2>{filingDetail.filing.filingDate}</h2>
              <p className="muted">Cached {formatCacheTime(filingDetail.filing.updatedAt)}</p>
            </div>
            <a className="buttonLink" href={filingDetail.filing.secUrl} target="_blank" rel="noreferrer">
              Open on SEC
            </a>
          </div>
          <iframe title="Cached SEC filing HTML" src={localHtmlUrl} />
        </section>
      ) : null}
    </main>
  );
}
