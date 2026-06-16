import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { normalizeFinancialMetrics } from "./financial-facts.ts";

const REVENUE_TAG = "Revenues";
const CORE_METRIC_KEYS = [
  "revenue",
  "operatingIncome",
  "netIncome",
  "assets",
  "liabilities",
  "equity",
  "cash",
  "operatingCashFlow",
  "investingCashFlow",
  "financingCashFlow"
];

function companyFacts(tag, facts) {
  return {
    facts: {
      "us-gaap": {
        [tag]: {
          units: {
            USD: facts
          }
        }
      }
    }
  };
}

function multiConceptFacts(concepts) {
  return {
    facts: {
      "us-gaap": Object.fromEntries(
        Object.entries(concepts).map(([tag, facts]) => [
          tag,
          {
            units: {
              USD: facts
            }
          }
        ])
      )
    }
  };
}

function metric(data, key) {
  const found = normalizeFinancialMetrics(data).find((candidate) => candidate.key === key);
  assert.ok(found, `Missing metric ${key}`);
  return found;
}

function allPoints(metrics) {
  return metrics.flatMap((item) => [...item.annual, ...item.quarterly]);
}

test("returns only the core statement metrics", () => {
  const metrics = normalizeFinancialMetrics(multiConceptFacts({}));

  assert.deepEqual(
    metrics.map((item) => item.key),
    CORE_METRIC_KEYS
  );
  assert.equal(metrics.some((item) => item.key === "capex"), false);
  assert.equal(metrics.some((item) => item.key === "freeCashFlow"), false);
});

test("groups every metric by statement and includes educational metadata", () => {
  const metrics = normalizeFinancialMetrics(multiConceptFacts({}));
  const statementsByMetric = Object.fromEntries(
    metrics.map((item) => [item.key, item.statement])
  );

  assert.deepEqual(
    CORE_METRIC_KEYS.map((key) => statementsByMetric[key]),
    [
      "income",
      "income",
      "income",
      "balance",
      "balance",
      "balance",
      "balance",
      "cashFlow",
      "cashFlow",
      "cashFlow"
    ]
  );

  for (const item of metrics) {
    assert.equal(item.importance, "foundation");
    assert.equal(item.reliability, "high");
    assert.ok(item.description.length > 12);
  }
});

test("revenue falls back to SalesRevenueNet", () => {
  const revenue = metric(
    companyFacts("SalesRevenueNet", [
      fact({ fp: "FY", fy: 2025, form: "10-K", start: "2025-01-01", end: "2025-12-31", val: 123 })
    ]),
    "revenue"
  );

  assert.equal(revenue.annual.at(-1)?.value, 123);
  assert.equal(revenue.annual.at(-1)?.tag, "SalesRevenueNet");
});

test("derives Apple-style Q4 revenue from the same fiscal-year date window", () => {
  const revenue = metric(
    companyFacts(REVENUE_TAG, [
      fact({ fp: "FY", fy: 2025, form: "10-K", start: "2024-09-29", end: "2025-09-27", val: 416_161 }),
      fact({ fp: "Q1", fy: 2025, form: "10-Q", start: "2024-09-29", end: "2024-12-28", val: 124_300 }),
      fact({ fp: "Q2", fy: 2025, form: "10-Q", start: "2024-12-29", end: "2025-03-29", val: 95_359 }),
      fact({ fp: "Q3", fy: 2025, form: "10-Q", start: "2025-03-30", end: "2025-06-28", val: 94_036 })
    ]),
    "revenue"
  );
  const q4 = revenue.quarterly.find((point) => point.end === "2025-09-27");

  assert.equal(q4?.fiscalYear, 2025);
  assert.equal(q4?.fiscalPeriod, "Q4");
  assert.equal(q4?.source, "derived");
  assert.equal(q4?.value, 102_466);
});

test("does not derive Q4 when a required quarter is missing", () => {
  const revenue = metric(
    companyFacts(REVENUE_TAG, [
      fact({ fp: "FY", fy: 2025, form: "10-K", start: "2024-01-01", end: "2024-12-31", val: 100 }),
      fact({ fp: "Q1", fy: 2025, form: "10-Q", start: "2024-01-01", end: "2024-03-31", val: 20 }),
      fact({ fp: "Q3", fy: 2025, form: "10-Q", start: "2024-07-01", end: "2024-09-30", val: 30 })
    ]),
    "revenue"
  );

  assert.equal(revenue.quarterly.some((point) => point.fiscalPeriod === "Q4"), false);
});

test("later comparative facts do not relabel older fiscal periods", () => {
  const revenue = metric(
    companyFacts(REVENUE_TAG, [
      fact({ fp: "FY", fy: 2024, form: "10-K", start: "2024-01-01", end: "2024-12-31", val: 220 }),
      fact({ fp: "Q1", fy: 2024, form: "10-Q", start: "2024-01-01", end: "2024-03-31", val: 50 }),
      fact({ fp: "Q2", fy: 2024, form: "10-Q", start: "2024-04-01", end: "2024-06-30", val: 60, filed: "2024-07-25" }),
      fact({ fp: "Q2", fy: 2025, form: "10-Q", start: "2024-04-01", end: "2024-06-30", val: 60, filed: "2025-07-25", frame: "CY2024Q2" }),
      fact({ fp: "Q3", fy: 2024, form: "10-Q", start: "2024-07-01", end: "2024-09-30", val: 70 })
    ]),
    "revenue"
  );
  const q2 = revenue.quarterly.find((point) => point.end === "2024-06-30");

  assert.equal(q2?.fiscalYear, 2024);
  assert.equal(q2?.fiscalPeriod, "Q2");
});

test("deduplicates repeated facts and keeps points sorted", () => {
  const revenue = metric(
    companyFacts(REVENUE_TAG, [
      fact({ fp: "Q2", fy: 2025, form: "10-Q", start: "2025-04-01", end: "2025-06-30", val: 22, filed: "2025-07-20" }),
      fact({ fp: "Q1", fy: 2025, form: "10-Q", start: "2025-01-01", end: "2025-03-31", val: 10 }),
      fact({ fp: "Q2", fy: 2025, form: "10-Q", start: "2025-04-01", end: "2025-06-30", val: 24, filed: "2026-07-20", frame: "CY2025Q2" })
    ]),
    "revenue"
  );

  assert.deepEqual(
    revenue.quarterly.map((point) => point.end),
    ["2025-03-31", "2025-06-30"]
  );
  assert.equal(revenue.quarterly.at(-1)?.value, 24);
});

test("instant metrics never synthesize derived Q4 points", () => {
  const assets = metric(
    companyFacts("Assets", [
      fact({ fp: "Q1", fy: 2025, form: "10-Q", end: "2025-03-31", val: 100 }),
      fact({ fp: "Q2", fy: 2025, form: "10-Q", end: "2025-06-30", val: 120 }),
      fact({ fp: "Q3", fy: 2025, form: "10-Q", end: "2025-09-30", val: 140 }),
      fact({ fp: "FY", fy: 2025, form: "10-K", end: "2025-12-31", val: 160 })
    ]),
    "assets"
  );

  assert.equal(assets.quarterly.some((point) => point.source === "derived"), false);
  assert.equal(assets.quarterly.find((point) => point.end === "2025-12-31")?.fiscalPeriod, "Q4");
});

test("cash-flow metrics remain duration metrics and can derive Q4", () => {
  const investingCashFlow = metric(
    companyFacts("NetCashProvidedByUsedInInvestingActivities", [
      fact({ fp: "FY", fy: 2025, form: "10-K", start: "2025-01-01", end: "2025-12-31", val: 100 }),
      fact({ fp: "Q1", fy: 2025, form: "10-Q", start: "2025-01-01", end: "2025-03-31", val: 20 }),
      fact({ fp: "Q2", fy: 2025, form: "10-Q", start: "2025-04-01", end: "2025-06-30", val: 30 }),
      fact({ fp: "Q3", fy: 2025, form: "10-Q", start: "2025-07-01", end: "2025-09-30", val: 25 })
    ]),
    "investingCashFlow"
  );
  const q4 = investingCashFlow.quarterly.find((point) => point.fiscalPeriod === "Q4");

  assert.equal(investingCashFlow.annual.at(-1)?.start, "2025-01-01");
  assert.equal(q4?.source, "derived");
  assert.equal(q4?.value, 25);
});

test("balance-sheet metrics never derive Q4", () => {
  const liabilities = metric(
    companyFacts("Liabilities", [
      fact({ fp: "Q1", fy: 2025, form: "10-Q", end: "2025-03-31", val: 100 }),
      fact({ fp: "Q2", fy: 2025, form: "10-Q", end: "2025-06-30", val: 120 }),
      fact({ fp: "Q3", fy: 2025, form: "10-Q", end: "2025-09-30", val: 140 }),
      fact({ fp: "FY", fy: 2025, form: "10-K", end: "2025-12-31", val: 160 })
    ]),
    "liabilities"
  );

  assert.equal(liabilities.quarterly.some((point) => point.source === "derived"), false);
});

test("all normalized points include provenance and have no duplicate period ends", () => {
  const metrics = normalizeFinancialMetrics(
    multiConceptFacts({
      Revenues: [
        fact({ fp: "FY", fy: 2025, form: "10-K", start: "2025-01-01", end: "2025-12-31", val: 100 }),
        fact({ fp: "Q1", fy: 2025, form: "10-Q", start: "2025-01-01", end: "2025-03-31", val: 20 }),
        fact({ fp: "Q2", fy: 2025, form: "10-Q", start: "2025-04-01", end: "2025-06-30", val: 25 }),
        fact({ fp: "Q3", fy: 2025, form: "10-Q", start: "2025-07-01", end: "2025-09-30", val: 30 })
      ],
      Assets: [fact({ fp: "FY", fy: 2025, form: "10-K", end: "2025-12-31", val: 500 })]
    })
  );

  for (const point of allPoints(metrics)) {
    assert.equal(point.unit, "USD");
    assert.ok(point.tag);
    assert.ok(point.source === "reported" || point.source === "derived");
    assert.ok(point.quality);
    assert.ok(Array.isArray(point.warnings));
  }

  for (const item of metrics) {
    for (const period of ["annual", "quarterly"]) {
      const ends = item[period].map((point) => point.end);
      assert.deepEqual(ends, [...ends].sort());
      assert.equal(new Set(ends).size, ends.length);
    }
  }
});

test("cached NVIDIA revenue has no impossible negative points", { skip: !existsSync("data/sec-cache/0001045810/companyfacts.json") }, () => {
  const data = JSON.parse(readFileSync("data/sec-cache/0001045810/companyfacts.json", "utf8"));
  const revenue = metric(data, "revenue");

  assert.equal(revenue.quarterly.some((point) => point.value < 0), false);
});

function fact(input) {
  return {
    accn: input.accn ?? `${input.form}-${input.end}`,
    filed: input.filed ?? "2026-01-01",
    frame: input.frame,
    fy: input.fy,
    fp: input.fp,
    form: input.form,
    start: input.start,
    end: input.end,
    val: input.val
  };
}
