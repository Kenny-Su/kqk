import type {
  FinancialDataPoint,
  FinancialMetric,
  FinancialMetricKind,
  FinancialStatement
} from "./types";

export type CompanyFactUnit = {
  accn?: string;
  end?: string;
  filed?: string;
  form?: string;
  fp?: string;
  frame?: string;
  fy?: number;
  start?: string;
  val?: number;
};

export type CompanyConcept = {
  units?: Record<string, CompanyFactUnit[]>;
};

export type CompanyFactsResponse = {
  facts?: {
    "us-gaap"?: Record<string, CompanyConcept>;
  };
};

type MetricDefinition = {
  key: string;
  label: string;
  statement: FinancialStatement;
  kind: FinancialMetricKind;
  unit: "USD";
  tags: string[];
  nonNegative: boolean;
};

type FactCandidate = CompanyFactUnit & {
  tag: string;
  tagPriority: number;
  unit: "USD";
};

type SelectedFact = {
  valueFact: FactCandidate;
};

type NormalizedResult = {
  points: FinancialDataPoint[];
  warnings: string[];
};

const FINANCIAL_METRICS: MetricDefinition[] = [
  {
    key: "revenue",
    label: "Revenue",
    statement: "income",
    kind: "duration",
    unit: "USD",
    tags: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet"
    ],
    nonNegative: true
  },
  {
    key: "operatingIncome",
    label: "Operating Income",
    statement: "income",
    kind: "duration",
    unit: "USD",
    tags: ["OperatingIncomeLoss"],
    nonNegative: false
  },
  {
    key: "netIncome",
    label: "Net Income",
    statement: "income",
    kind: "duration",
    unit: "USD",
    tags: ["NetIncomeLoss"],
    nonNegative: false
  },
  {
    key: "assets",
    label: "Assets",
    statement: "balance",
    kind: "instant",
    unit: "USD",
    tags: ["Assets"],
    nonNegative: true
  },
  {
    key: "liabilities",
    label: "Liabilities",
    statement: "balance",
    kind: "instant",
    unit: "USD",
    tags: ["Liabilities"],
    nonNegative: true
  },
  {
    key: "equity",
    label: "Equity",
    statement: "balance",
    kind: "instant",
    unit: "USD",
    tags: [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"
    ],
    nonNegative: false
  },
  {
    key: "cash",
    label: "Cash",
    statement: "balance",
    kind: "instant",
    unit: "USD",
    tags: [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"
    ],
    nonNegative: true
  },
  {
    key: "operatingCashFlow",
    label: "Operating Cash Flow",
    statement: "cashFlow",
    kind: "duration",
    unit: "USD",
    tags: ["NetCashProvidedByUsedInOperatingActivities"],
    nonNegative: false
  },
  {
    key: "investingCashFlow",
    label: "Investing Cash Flow",
    statement: "cashFlow",
    kind: "duration",
    unit: "USD",
    tags: ["NetCashProvidedByUsedInInvestingActivities"],
    nonNegative: false
  },
  {
    key: "financingCashFlow",
    label: "Financing Cash Flow",
    statement: "cashFlow",
    kind: "duration",
    unit: "USD",
    tags: ["NetCashProvidedByUsedInFinancingActivities"],
    nonNegative: false
  }
];

export function normalizeFinancialMetrics(data: CompanyFactsResponse): FinancialMetric[] {
  const usGaap = data.facts?.["us-gaap"] ?? {};
  return FINANCIAL_METRICS.map((definition) =>
    normalizeMetric(usGaap, definition)
  );
}

function normalizeMetric(
  usGaap: Record<string, CompanyConcept>,
  definition: MetricDefinition
): FinancialMetric {
  const facts = factsForDefinition(usGaap, definition);
  const annualResult = normalizeAnnualFacts(facts, definition);
  const annual = validateMetricPoints(definition, annualResult.points);
  const warnings = uniqueWarnings([
    ...annualResult.warnings,
    ...annual.warnings
  ]);

  return {
    key: definition.key,
    label: definition.label,
    statement: definition.statement,
    kind: definition.kind,
    unit: definition.unit,
    annual: annual.points,
    warnings
  };
}

function factsForDefinition(
  usGaap: Record<string, CompanyConcept>,
  definition: MetricDefinition
): FactCandidate[] {
  return definition.tags.flatMap((tag, tagPriority) =>
    (usGaap[tag]?.units?.[definition.unit] ?? []).map((fact) => ({
      ...fact,
      tag,
      tagPriority,
      unit: definition.unit
    }))
  );
}

function normalizeAnnualFacts(
  facts: FactCandidate[],
  definition: MetricDefinition
): NormalizedResult {
  const warnings: string[] = [];
  const candidates = facts.filter((fact) => isUsableAnnualFact(fact, definition));
  const byPeriod = new Map<string, SelectedFact>();

  for (const fact of candidates) {
    const key = factPeriodKey(fact, definition.kind);
    if (!key) continue;
    const current = byPeriod.get(key);
    if (!current) {
      byPeriod.set(key, {
        valueFact: fact
      });
      continue;
    }

    if (compareFactPreference(fact, current.valueFact) > 0) {
      current.valueFact = fact;
    }
  }

  if (facts.length > 0 && byPeriod.size === 0) {
    warnings.push(`${definition.label}: no usable annual ${definition.unit} facts.`);
  }

  return {
    points: Array.from(byPeriod.values())
      .map(({ valueFact }) => toFinancialPoint(valueFact))
      .sort(comparePointsByEnd),
    warnings
  };
}

function isUsableAnnualFact(fact: FactCandidate, definition: MetricDefinition) {
  if (!hasRequiredFactFields(fact, definition.kind)) return false;

  if (definition.kind === "instant") {
    return fact.form === "10-K";
  }

  return fact.form === "10-K" && isAnnualDuration(fact);
}

function hasRequiredFactFields(fact: FactCandidate, kind: MetricDefinition["kind"]) {
  return (
    typeof fact.val === "number" &&
    Number.isFinite(fact.val) &&
    Boolean(fact.end) &&
    Boolean(fact.filed) &&
    (kind === "instant" || Boolean(fact.start))
  );
}

function isAnnualDuration(fact: CompanyFactUnit) {
  if (!fact.start || !fact.end) return false;
  return durationDays(fact.start, fact.end) >= 330 && durationDays(fact.start, fact.end) <= 400;
}

function durationDays(start: string, end: string) {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.round((endTime - startTime) / 86_400_000) + 1;
}

function factPeriodKey(fact: CompanyFactUnit, kind: MetricDefinition["kind"]) {
  if (!fact.end) return null;
  return kind === "duration" ? `${fact.start ?? ""}:${fact.end}` : fact.end;
}

function toFinancialPoint(valueFact: FactCandidate): FinancialDataPoint {
  return {
    start: valueFact.start ?? null,
    end: valueFact.end ?? "",
    filed: valueFact.filed ?? "",
    form: valueFact.form ?? "",
    accessionNumber: valueFact.accn ?? null,
    value: Number(valueFact.val),
    warnings: [],
    tag: valueFact.tag,
    unit: valueFact.unit
  };
}

function validateMetricPoints(
  definition: MetricDefinition,
  points: FinancialDataPoint[]
): NormalizedResult {
  const warnings: string[] = [];
  const cleaned = points.filter((point) => {
    if (!Number.isFinite(point.value)) {
      warnings.push(`${definition.label}: omitted annual point ending ${point.end}; value is not finite.`);
      return false;
    }

    if (definition.nonNegative && point.value < 0) {
      warnings.push(`${definition.label}: omitted negative annual point ending ${point.end}.`);
      return false;
    }

    return true;
  });
  const byEnd = new Map<string, FinancialDataPoint>();

  for (const point of cleaned) {
    const current = byEnd.get(point.end);
    if (!current) {
      byEnd.set(point.end, point);
      continue;
    }

    warnings.push(`${definition.label}: deduplicated annual point ending ${point.end}.`);
    byEnd.set(point.end, preferFinancialPoint(point, current));
  }

  return {
    points: Array.from(byEnd.values()).sort(comparePointsByEnd),
    warnings: uniqueWarnings(warnings)
  };
}

function preferFinancialPoint(
  next: FinancialDataPoint,
  current: FinancialDataPoint
) {
  return next.filed.localeCompare(current.filed) > 0 ? next : current;
}

function compareFactPreference(
  next: FactCandidate,
  current: FactCandidate
) {
  if (next.tagPriority !== current.tagPriority) {
    return current.tagPriority - next.tagPriority;
  }

  return String(next.filed ?? "").localeCompare(String(current.filed ?? ""));
}

function comparePointsByEnd(a: FinancialDataPoint, b: FinancialDataPoint) {
  return a.end.localeCompare(b.end);
}

function uniqueWarnings(warnings: string[]) {
  return Array.from(new Set(warnings));
}
