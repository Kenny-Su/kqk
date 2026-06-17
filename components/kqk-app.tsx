"use client";

import { FormEvent, useEffect, useState } from "react";
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
  FinancialDataPoint,
  FinancialFactsResponse,
  FinancialMetric,
  FinancialStatement,
  RecentSecFiling
} from "@/lib/types";

const FINANCIAL_STATEMENTS: Array<{ label: string; value: FinancialStatement }> = [
  { label: "Income Statement", value: "income" },
  { label: "Balance Sheet", value: "balance" },
  { label: "Cash Flow", value: "cashFlow" }
];

export function KqkApp() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [recentFilings, setRecentFilings] = useState<RecentSecFiling[]>([]);
  const [financialFacts, setFinancialFacts] = useState<FinancialFactsResponse | null>(null);
  const [factsStatement, setFactsStatement] = useState<FinancialStatement>("income");
  const [selectedMetricKey, setSelectedMetricKey] = useState("revenue");
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState("Ready.");
  const [loading, setLoading] = useState(false);

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const statementMetrics =
    financialFacts?.metrics.filter((metric) => metric.statement === factsStatement) ?? [];
  const selectedMetric =
    statementMetrics.find((metric) => metric.key === selectedMetricKey) ??
    statementMetrics[0] ??
    null;

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
    await response.json();
    setSelectedCompanyId(id);
    setRecentFilings([]);
    setFinancialFacts(null);
    setFactsError(null);
    setStatus("Company selected. Fetch recent SEC filings next.");
    void loadFinancialFacts(id);
  }

  async function deleteCompany(company: Company) {
    const label = company.ticker ?? company.name;
    if (!window.confirm(`Delete ${label} and cached financial facts?`)) return;

    setLoading(true);
    setStatus(`Deleting ${label}...`);
    try {
      const response = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (selectedCompanyId === company.id) {
        setSelectedCompanyId(null);
        setRecentFilings([]);
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
      await fetchRecentFilings(data.company.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add company.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecentFilings(companyId = selectedCompanyId) {
    if (!companyId) return;
    setStatus("Fetching recent SEC filing list...");
    try {
      const response = await fetch(`/api/companies/${companyId}/sec-filings`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const filings = (data.filings ?? []) as RecentSecFiling[];
      setRecentFilings(filings);
      setStatus(`Found ${filings.length} recent SEC filings.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not fetch SEC filing list.");
    }
  }

  async function handleFetchRecent() {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      await fetchRecentFilings(selectedCompanyId);
    } finally {
      setLoading(false);
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

  function formatStoredTime(value: string) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function filingTitle(filing: RecentSecFiling) {
    const title = filing.title ?? filing.primaryDocument;
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedForm = filing.formType.trim().toLowerCase();

    if (
      normalizedTitle === normalizedForm ||
      normalizedTitle === `form ${normalizedForm}` ||
      normalizedTitle === `${normalizedForm} filing`
    ) {
      return null;
    }

    return title;
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">SEC Company Dashboard</p>
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
            {recentFilings.length === 0 ? (
              <div className="emptyState">
                <strong>No filings loaded</strong>
                <span>Select a company, then refresh recent SEC filings.</span>
              </div>
            ) : null}
            {recentFilings.map((filing) => (
              <article className="listItem filingRow" key={filing.accessionNumber}>
                <span className="itemTopline">
                  <span className="filingIdentity">
                    <strong>{filing.formType}</strong>
                    <span>{filing.filingDate}</span>
                  </span>
                  <a
                    aria-label={`Open ${filing.formType} filed ${filing.filingDate} on SEC`}
                    className="sourceTextLink"
                    href={filing.secUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open on SEC"
                  >
                    <svg aria-hidden="true" viewBox="0 0 16 16">
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </a>
                </span>
                {filingTitle(filing) ? <span>{filingTitle(filing)}</span> : null}
              </article>
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
                Source: SEC company facts · Cached {formatStoredTime(financialFacts.cachedAt)}
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
              {selectedMetric ? (
                <FinancialMetricCard metric={selectedMetric} />
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

    </main>
  );
}

function FinancialMetricCard({ metric }: { metric: FinancialMetric }) {
  const points = metric.annual;
  const latest = points.at(-1);

  return (
    <article className="metricCard">
      <div className="metricHeader">
        <div>
          <h3>{metric.label}</h3>
        </div>
        {latest ? <strong>{formatMoney(latest.value)}</strong> : null}
      </div>
      {metric.warnings.length > 0 ? (
        <p className="metricWarning">{metric.warnings[0]}</p>
      ) : null}
      {points.length > 0 ? (
        <MetricChart metric={metric} points={points} />
      ) : (
        <div className="noMetricData">No SEC facts available.</div>
      )}
    </article>
  );
}

function MetricChart({
  metric,
  points
}: {
  metric: FinancialMetric;
  points: FinancialDataPoint[];
}) {
  const chartData = points.map((point) => ({
    label: pointPeriodLabel(point, metric.kind),
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
          <Tooltip content={<ChartTooltip />} />
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

function pointPeriodLabel(
  point: FinancialDataPoint,
  kind: FinancialMetric["kind"]
) {
  if (kind === "instant") return point.end;
  return point.start ? `${point.start} - ${point.end}` : point.end;
}

function ChartTooltip({
  active,
  label,
  payload
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: unknown }>;
}) {
  const value = Number(payload?.[0]?.value);
  if (!active || !Number.isFinite(value)) return null;

  return (
    <div className="chartTooltip">
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
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
