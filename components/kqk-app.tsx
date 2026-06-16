"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type {
  Company,
  Filing,
  FinancialDataPoint,
  FinancialFactsResponse,
  FinancialMetric,
  FinancialPeriod,
  FinancialStatement,
  RecentSecFiling
} from "@/lib/types";

type FilingDetail = {
  filing: Filing;
  company?: Company;
};

type FinancialTimeFrame = "1y" | "3y" | "5y" | "10y" | "all";

const FINANCIAL_TIME_FRAMES: Array<{ label: string; value: FinancialTimeFrame }> = [
  { label: "1Y", value: "1y" },
  { label: "3Y", value: "3y" },
  { label: "5Y", value: "5y" },
  { label: "10Y", value: "10y" },
  { label: "All", value: "all" }
];

const FINANCIAL_STATEMENTS: Array<{ label: string; value: FinancialStatement }> = [
  { label: "Income Statement", value: "income" },
  { label: "Balance Sheet", value: "balance" },
  { label: "Cash Flow", value: "cashFlow" }
];

export function KqkApp() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [recentFilings, setRecentFilings] = useState<RecentSecFiling[]>([]);
  const [cachedFilings, setCachedFilings] = useState<Filing[]>([]);
  const [filingDetail, setFilingDetail] = useState<FilingDetail | null>(null);
  const [financialFacts, setFinancialFacts] = useState<FinancialFactsResponse | null>(null);
  const [factsStatement, setFactsStatement] = useState<FinancialStatement>("income");
  const [factsPeriod, setFactsPeriod] = useState<FinancialPeriod>("annual");
  const [factsTimeFrame, setFactsTimeFrame] = useState<FinancialTimeFrame>("5y");
  const [selectedMetricKey, setSelectedMetricKey] = useState("revenue");
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsError, setFactsError] = useState<string | null>(null);
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

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const statementMetrics =
    financialFacts?.metrics.filter((metric) => metric.statement === factsStatement) ?? [];
  const selectedMetric =
    statementMetrics.find((metric) => metric.key === selectedMetricKey) ??
    statementMetrics[0] ??
    null;
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
    setFinancialFacts(null);
    setFactsError(null);
    setStatus("Company selected. Fetch recent SEC filings next.");
    void loadFinancialFacts(id);
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
        setFinancialFacts(null);
        setFactsError(null);
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

  async function loadFinancialFacts(companyId = selectedCompanyId, options: { force?: boolean } = {}) {
    if (!companyId) return;
    setFactsLoading(true);
    setFactsError(null);

    try {
      const suffix = options.force ? "?force=true" : "";
      const response = await fetch(`/api/companies/${companyId}/facts${suffix}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const facts = data as FinancialFactsResponse;
      setFinancialFacts(facts);
      const activeStatementMetrics = facts.metrics.filter(
        (metric) => metric.statement === factsStatement
      );
      if (!activeStatementMetrics.some((metric) => metric.key === selectedMetricKey)) {
        setSelectedMetricKey(activeStatementMetrics[0]?.key ?? facts.metrics[0]?.key ?? "revenue");
      }
      if (options.force) {
        setStatus("Financial facts refreshed.");
      }
    } catch (error) {
      setFactsError(error instanceof Error ? error.message : "Could not load financial facts.");
    } finally {
      setFactsLoading(false);
    }
  }

  function selectFinancialStatement(statement: FinancialStatement) {
    setFactsStatement(statement);
    const nextMetric = financialFacts?.metrics.find((metric) => metric.statement === statement);
    setSelectedMetricKey(nextMetric?.key ?? "revenue");
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
        <div className="brand">
          <p className="eyebrow">SEC Filing Viewer</p>
          <h1>KQK</h1>
        </div>
        <p className={loading ? "status busy" : "status"}>{loading ? "Working..." : status}</p>
      </header>

      <section className="grid two">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Companies</p>
              <h2>Add Company</h2>
            </div>
            <span className="countBadge">{companies.length}</span>
          </div>
          <form className="row" onSubmit={addCompany}>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Ticker or CIK, e.g. AAPL"
            />
            <button disabled={loading}>Add</button>
          </form>

          <div className="list">
            {companies.length === 0 ? (
              <div className="emptyState">
                <strong>No companies yet</strong>
                <span>Add a ticker or CIK to fetch its latest filing.</span>
              </div>
            ) : null}
            {companies.map((company) => (
              <div className="companyRow" key={company.id}>
                <button
                  className={company.id === selectedCompanyId ? "listItem active" : "listItem"}
                  onClick={() => loadCompany(company.id)}
                  type="button"
                >
                  <span className="itemTopline">
                    <strong>{company.ticker ?? company.cik}</strong>
                    <span className="pill">CIK {company.cik}</span>
                  </span>
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
            <div>
              <p className="eyebrow">
                {selectedCompany ? selectedCompany.ticker ?? selectedCompany.cik : "Filings"}
              </p>
              <h2>Recent Filings</h2>
            </div>
            <button disabled={!selectedCompanyId || loading} onClick={handleFetchRecent}>
              Refresh Recent
            </button>
          </div>
          <div className="list compact">
            {filingChoices.length === 0 ? (
              <div className="emptyState">
                <strong>No filings loaded</strong>
                <span>Select a company, then refresh recent SEC filings.</span>
              </div>
            ) : null}
            {filingChoices.map((choice) => (
              <button
                className={choice.cached?.id === filingDetail?.filing.id ? "listItem active" : "listItem"}
                key={choice.key}
                onClick={() => openOrFetchFiling(choice)}
                type="button"
              >
                <span className="itemTopline">
                  <strong>{choice.formType}</strong>
                  <span>{choice.filingDate}</span>
                </span>
                {filingTitle(choice) ? <span>{filingTitle(choice)}</span> : null}
                <span className={choice.cached ? "cacheState cached" : "cacheState"}>
                  {choice.cached
                    ? `Cached ${formatCacheTime(choice.cached.updatedAt)}`
                    : "Not cached"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {selectedCompany ? (
        <section className="panel factsPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">{selectedCompany.ticker ?? selectedCompany.cik}</p>
              <h2>Financial Facts</h2>
            </div>
            <div className="factsControls">
              <div className="segmented" aria-label="Financial facts period">
                <button
                  className={factsPeriod === "annual" ? "activeSegment" : ""}
                  onClick={() => setFactsPeriod("annual")}
                  type="button"
                >
                  Annual
                </button>
                <button
                  className={factsPeriod === "quarterly" ? "activeSegment" : ""}
                  onClick={() => setFactsPeriod("quarterly")}
                  type="button"
                >
                  Quarterly
                </button>
              </div>
              <button
                className="secondaryButton"
                disabled={factsLoading}
                onClick={() => loadFinancialFacts(selectedCompany.id, { force: true })}
                type="button"
              >
                Refresh Facts
              </button>
            </div>
          </div>

          {factsError ? (
            <div className="emptyState">
              <strong>Could not load financial facts</strong>
              <span>{factsError}</span>
            </div>
          ) : factsLoading && !financialFacts ? (
            <div className="emptyState">
              <strong>Loading financial facts</strong>
              <span>Fetching structured SEC XBRL data.</span>
            </div>
          ) : financialFacts ? (
            <>
              <p className="muted factsMeta">
                Source: SEC company facts · Cached {formatCacheTime(financialFacts.cachedAt)}
              </p>
              <div className="statementTabs segmented" aria-label="Financial statement">
                {FINANCIAL_STATEMENTS.map((statement) => (
                  <button
                    className={factsStatement === statement.value ? "activeSegment" : ""}
                    key={statement.value}
                    onClick={() => selectFinancialStatement(statement.value)}
                    type="button"
                  >
                    {statement.label}
                  </button>
                ))}
              </div>
              <div className="metricSelector" aria-label="Financial metric">
                {statementMetrics.map((metric) => (
                  <button
                    className={metric.key === selectedMetricKey ? "metricOption activeMetric" : "metricOption"}
                    key={metric.key}
                    onClick={() => setSelectedMetricKey(metric.key)}
                    type="button"
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
              <div className="timeFrameSelector" aria-label="Financial facts time frame">
                <span className="selectorLabel">Time frame</span>
                <div className="segmented">
                  {FINANCIAL_TIME_FRAMES.map((timeFrame) => (
                    <button
                      className={factsTimeFrame === timeFrame.value ? "activeSegment" : ""}
                      key={timeFrame.value}
                      onClick={() => setFactsTimeFrame(timeFrame.value)}
                      type="button"
                    >
                      {timeFrame.label}
                    </button>
                  ))}
                </div>
              </div>
              {selectedMetric ? (
                <FinancialMetricCard
                  metric={selectedMetric}
                  period={factsPeriod}
                  timeFrame={factsTimeFrame}
                />
              ) : (
                <div className="noMetricData">No SEC facts available.</div>
              )}
            </>
          ) : (
            <div className="emptyState">
              <strong>No SEC facts loaded</strong>
              <span>Financial facts load when a company is selected.</span>
            </div>
          )}
        </section>
      ) : null}

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
      ) : (
        <section className="viewer emptyViewer">
          <div>
            <p className="eyebrow">Viewer</p>
            <h2>No Filing Open</h2>
            <p className="muted">Choose a cached filing or fetch one from SEC to display it here.</p>
          </div>
        </section>
      )}
    </main>
  );
}

function FinancialMetricCard({
  metric,
  period,
  timeFrame
}: {
  metric: FinancialMetric;
  period: FinancialPeriod;
  timeFrame: FinancialTimeFrame;
}) {
  const points = sliceMetricPoints(metric[period], period, timeFrame);
  const latest = points.at(-1);

  return (
    <article className="metricCard">
      <div className="metricHeader">
        <div>
          <h3>{metric.label}</h3>
          <p className="muted">
            {latest ? pointLabel(latest) : "No SEC facts available"}
          </p>
        </div>
        {latest ? <strong>{formatMoney(latest.value)}</strong> : null}
      </div>
      <div className="metricContext">
        <p>{metric.description}</p>
      </div>
      {metric.warnings.length > 0 ? (
        <p className="metricWarning">{metric.warnings[0]}</p>
      ) : null}
      {points.length > 0 ? (
        <MetricChart points={points} />
      ) : (
        <div className="noMetricData">No SEC facts available.</div>
      )}
    </article>
  );
}

function sliceMetricPoints(
  points: FinancialDataPoint[],
  period: FinancialPeriod,
  timeFrame: FinancialTimeFrame
) {
  if (timeFrame === "all") return points;

  const years = Number(timeFrame.replace("y", ""));
  const pointCount = period === "annual" ? years : years * 4;
  return points.slice(-pointCount);
}

function MetricChart({ points }: { points: FinancialDataPoint[] }) {
  const chartData = points.map((point) => ({
    fiscalPeriod: pointLabel(point),
    label: point.end,
    source: point.source,
    value: point.value
  }));

  return (
    <div className="chartFrame">
      <ResponsiveContainer height={320} width="100%">
        <AreaChart data={chartData} margin={{ bottom: 26, left: 18, right: 24, top: 16 }}>
          <CartesianGrid stroke="#dfe4dd" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            label={{ value: "Period", position: "insideBottom", offset: -16 }}
            stroke="#66706a"
            tick={{ fill: "#66706a", fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            label={{ value: "USD", angle: -90, position: "insideLeft" }}
            stroke="#66706a"
            tick={{ fill: "#66706a", fontSize: 12 }}
            tickFormatter={formatMoney}
            tickLine={false}
            width={72}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #dfe4dd",
              borderRadius: 8,
              boxShadow: "0 12px 28px rgba(35, 45, 38, 0.12)"
            }}
            formatter={(value) => [formatMoney(Number(value)), "Value"]}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as {
                fiscalPeriod?: string;
                label?: string;
                source?: FinancialDataPoint["source"];
              };
              const sourceLabel = point?.source === "derived" ? " · Derived" : "";
              return point?.fiscalPeriod
                ? `${point.fiscalPeriod} (${point.label})${sourceLabel}`
                : `Period: ${point?.label ?? ""}${sourceLabel}`;
            }}
          />
          <Area
            dataKey="value"
            fill="rgba(31, 107, 69, 0.14)"
            stroke="#1f6b45"
            strokeWidth={3}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000_000) {
    return `${sign}$${(absolute / 1_000_000_000_000).toFixed(1)}T`;
  }

  if (absolute >= 1_000_000_000) {
    return `${sign}$${(absolute / 1_000_000_000).toFixed(1)}B`;
  }

  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  }

  return `${sign}$${Math.round(absolute).toLocaleString()}`;
}

function pointLabel(point: { end: string; fiscalYear: number | null; fiscalPeriod: string | null }) {
  if (point.fiscalYear && point.fiscalPeriod) {
    return `${point.fiscalYear} ${point.fiscalPeriod}`;
  }

  return point.end;
}
