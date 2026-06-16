import type {
  FinancialDataPoint,
  FinancialMetric,
  FinancialMetricImportance,
  FinancialMetricReliability,
  FinancialPeriod,
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
  importance: FinancialMetricImportance;
  reliability: FinancialMetricReliability;
  description: string;
  kind: "duration" | "instant";
  unit: "USD";
  tags: string[];
  deriveFourthQuarter: boolean;
  nonNegative: boolean;
};

type FactCandidate = CompanyFactUnit & {
  tag: string;
  tagPriority: number;
  unit: "USD";
};

type SelectedFact = {
  periodFact: FactCandidate;
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
    importance: "foundation",
    reliability: "high",
    description: "Sales generated from the company's goods and services.",
    kind: "duration",
    unit: "USD",
    tags: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet"
    ],
    deriveFourthQuarter: true,
    nonNegative: true
  },
  {
    key: "operatingIncome",
    label: "Operating Income",
    statement: "income",
    importance: "foundation",
    reliability: "high",
    description: "Profit from core operations before interest and taxes.",
    kind: "duration",
    unit: "USD",
    tags: ["OperatingIncomeLoss"],
    deriveFourthQuarter: true,
    nonNegative: false
  },
  {
    key: "netIncome",
    label: "Net Income",
    statement: "income",
    importance: "foundation",
    reliability: "high",
    description: "Profit after all expenses, taxes, gains, and losses.",
    kind: "duration",
    unit: "USD",
    tags: ["NetIncomeLoss"],
    deriveFourthQuarter: true,
    nonNegative: false
  },
  {
    key: "assets",
    label: "Assets",
    statement: "balance",
    importance: "foundation",
    reliability: "high",
    description: "Resources the company controls at a point in time.",
    kind: "instant",
    unit: "USD",
    tags: ["Assets"],
    deriveFourthQuarter: false,
    nonNegative: true
  },
  {
    key: "liabilities",
    label: "Liabilities",
    statement: "balance",
    importance: "foundation",
    reliability: "high",
    description: "Obligations the company owes at a point in time.",
    kind: "instant",
    unit: "USD",
    tags: ["Liabilities"],
    deriveFourthQuarter: false,
    nonNegative: true
  },
  {
    key: "equity",
    label: "Equity",
    statement: "balance",
    importance: "foundation",
    reliability: "high",
    description: "Owners' residual claim after liabilities are subtracted from assets.",
    kind: "instant",
    unit: "USD",
    tags: [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"
    ],
    deriveFourthQuarter: false,
    nonNegative: false
  },
  {
    key: "cash",
    label: "Cash",
    statement: "balance",
    importance: "foundation",
    reliability: "high",
    description: "Cash and cash equivalents available on the balance sheet date.",
    kind: "instant",
    unit: "USD",
    tags: [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"
    ],
    deriveFourthQuarter: false,
    nonNegative: true
  },
  {
    key: "operatingCashFlow",
    label: "Operating Cash Flow",
    statement: "cashFlow",
    importance: "foundation",
    reliability: "high",
    description: "Cash generated or used by the company's normal operations.",
    kind: "duration",
    unit: "USD",
    tags: ["NetCashProvidedByUsedInOperatingActivities"],
    deriveFourthQuarter: true,
    nonNegative: false
  },
  {
    key: "investingCashFlow",
    label: "Investing Cash Flow",
    statement: "cashFlow",
    importance: "foundation",
    reliability: "high",
    description: "Cash generated or used by investing activities, such as assets and acquisitions.",
    kind: "duration",
    unit: "USD",
    tags: ["NetCashProvidedByUsedInInvestingActivities"],
    deriveFourthQuarter: true,
    nonNegative: false
  },
  {
    key: "financingCashFlow",
    label: "Financing Cash Flow",
    statement: "cashFlow",
    importance: "foundation",
    reliability: "high",
    description: "Cash generated or used by financing activities, such as debt and stock transactions.",
    kind: "duration",
    unit: "USD",
    tags: ["NetCashProvidedByUsedInFinancingActivities"],
    deriveFourthQuarter: true,
    nonNegative: false
  }
];

const QUARTER_PERIODS = ["Q1", "Q2", "Q3", "Q4"];

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
  const annualResult = normalizePeriodFacts(facts, definition, "annual");
  const annual = validateMetricPoints(definition, "annual", annualResult.points);
  const quarterlyResult = normalizePeriodFacts(facts, definition, "quarterly");
  const labeledQuarterly =
    definition.kind === "duration"
      ? labelDurationQuarters(quarterlyResult.points, annual.points)
      : labelInstantQuarters(quarterlyResult.points);
  const withFourthQuarters =
    definition.deriveFourthQuarter
      ? deriveFourthQuarters(definition, labeledQuarterly, annual.points)
      : { points: labeledQuarterly, warnings: [] };
  const quarterly = validateMetricPoints(
    definition,
    "quarterly",
    withFourthQuarters.points
  );
  const warnings = uniqueWarnings([
    ...annualResult.warnings,
    ...annual.warnings,
    ...quarterlyResult.warnings,
    ...withFourthQuarters.warnings,
    ...quarterly.warnings,
    ...annualQuarterSumWarnings(definition, annual.points, quarterly.points)
  ]);

  return {
    key: definition.key,
    label: definition.label,
    statement: definition.statement,
    importance: definition.importance,
    reliability: definition.reliability,
    description: definition.description,
    unit: definition.unit,
    annual: annual.points,
    quarterly: quarterly.points,
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

function normalizePeriodFacts(
  facts: FactCandidate[],
  definition: MetricDefinition,
  period: FinancialPeriod
): NormalizedResult {
  const warnings: string[] = [];
  const candidates = facts.filter((fact) => isUsableFact(fact, definition, period));
  const periodCandidates = facts.filter((fact) =>
    isPeriodIdentityFact(fact, definition, period)
  );
  const byPeriod = new Map<string, SelectedFact>();

  for (const fact of candidates) {
    const key = factPeriodKey(fact, definition.kind);
    if (!key) continue;
    const current = byPeriod.get(key);
    if (!current) {
      byPeriod.set(key, {
        periodFact: fact,
        valueFact: fact
      });
      continue;
    }

    if (isEarlierFiledFact(fact, current.periodFact)) {
      current.periodFact = fact;
    }

    if (compareFactPreference(fact, current.valueFact, period) > 0) {
      current.valueFact = fact;
    }
  }

  for (const fact of periodCandidates) {
    const key = factPeriodKey(fact, definition.kind);
    if (!key) continue;
    const current = byPeriod.get(key);
    if (current && isEarlierFiledFact(fact, current.periodFact)) {
      current.periodFact = fact;
    }
  }

  if (facts.length > 0 && byPeriod.size === 0) {
    warnings.push(`${definition.label}: no usable ${period} ${definition.unit} facts.`);
  }

  return {
    points: Array.from(byPeriod.values())
      .map(({ periodFact, valueFact }) => toFinancialPoint(periodFact, valueFact))
      .sort(comparePointsByEnd),
    warnings
  };
}

function isPeriodIdentityFact(
  fact: FactCandidate,
  definition: MetricDefinition,
  period: FinancialPeriod
) {
  if (!hasRequiredFactFields(fact, definition.kind)) return false;

  if (period === "annual") {
    return fact.form === "10-K" && fact.fp === "FY";
  }

  if (definition.kind === "instant") {
    return (
      (fact.form === "10-Q" && /^Q[1-3]$/.test(fact.fp ?? "")) ||
      (fact.form === "10-K" && fact.fp === "FY")
    );
  }

  return (
    (fact.form === "10-Q" && /^Q[1-3]$/.test(fact.fp ?? "")) ||
    (fact.form === "10-K" && isQuarterDuration(fact))
  );
}

function isUsableFact(
  fact: FactCandidate,
  definition: MetricDefinition,
  period: FinancialPeriod
) {
  if (!hasRequiredFactFields(fact, definition.kind)) return false;

  if (definition.kind === "instant") {
    return period === "annual"
      ? fact.form === "10-K" && fact.fp === "FY"
      : (fact.form === "10-Q" && /^Q[1-3]$/.test(fact.fp ?? "")) ||
          (fact.form === "10-K" && fact.fp === "FY");
  }

  if (period === "annual") {
    return fact.form === "10-K" && fact.fp === "FY" && isAnnualDuration(fact);
  }

  return (
    ((fact.form === "10-Q" && /^Q[1-3]$/.test(fact.fp ?? "")) ||
      fact.form === "10-K") &&
    isQuarterDuration(fact)
  );
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

function isQuarterDuration(fact: CompanyFactUnit) {
  if (!fact.start || !fact.end) return false;
  return durationDays(fact.start, fact.end) >= 60 && durationDays(fact.start, fact.end) <= 120;
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

function toFinancialPoint(
  periodFact: FactCandidate,
  valueFact: FactCandidate
): FinancialDataPoint {
  return {
    start: valueFact.start ?? null,
    end: valueFact.end ?? "",
    filed: valueFact.filed ?? "",
    fiscalYear: periodFact.fy ?? null,
    fiscalPeriod: periodFact.fp ?? null,
    form: valueFact.form ?? "",
    accessionNumber: valueFact.accn ?? null,
    value: Number(valueFact.val),
    source: "reported",
    quality: "high",
    warnings: [],
    tag: valueFact.tag,
    unit: valueFact.unit
  };
}

function labelDurationQuarters(
  quarterly: FinancialDataPoint[],
  annual: FinancialDataPoint[]
) {
  return quarterly.map((point) => {
    const annualPoint = annual.find(
      (candidate) =>
        candidate.start &&
        point.end > candidate.start &&
        point.end <= candidate.end
    );
    if (!annualPoint) return point;

    return {
      ...point,
      fiscalYear: annualPoint.fiscalYear,
      fiscalPeriod:
        point.end === annualPoint.end ? "Q4" : cleanQuarterPeriod(point.fiscalPeriod)
    };
  });
}

function labelInstantQuarters(points: FinancialDataPoint[]) {
  return points.map((point) => ({
    ...point,
    fiscalPeriod:
      point.form === "10-K" && point.fiscalPeriod === "FY"
        ? "Q4"
        : cleanQuarterPeriod(point.fiscalPeriod)
  }));
}

function deriveFourthQuarters(
  definition: MetricDefinition,
  quarterly: FinancialDataPoint[],
  annual: FinancialDataPoint[]
): NormalizedResult {
  const warnings: string[] = [];
  const derived = annual
    .map((annualPoint): FinancialDataPoint | null => {
      if (!annualPoint.start) return null;
      const annualStart = annualPoint.start;
      const sameFiscalWindow = quarterly.filter(
        (point) => point.end > annualStart && point.end <= annualPoint.end
      );
      if (sameFiscalWindow.some((point) => point.fiscalPeriod === "Q4")) return null;

      const firstThreeQuarters = ["Q1", "Q2", "Q3"].map((period) =>
        sameFiscalWindow.find((point) => point.fiscalPeriod === period)
      );
      if (firstThreeQuarters.some((point) => !point)) return null;

      const firstThreeTotal = firstThreeQuarters.reduce(
        (total, point) => total + (point?.value ?? 0),
        0
      );
      const value = annualPoint.value - firstThreeTotal;

      if (!Number.isFinite(value)) {
        warnings.push(`${definition.label}: omitted Q4 ending ${annualPoint.end}; value is not finite.`);
        return null;
      }

      if (definition.nonNegative && (value < 0 || value > annualPoint.value)) {
        warnings.push(
          `${definition.label}: omitted suspicious derived Q4 ending ${annualPoint.end}.`
        );
        return null;
      }

      return {
        ...annualPoint,
        fiscalPeriod: "Q4",
        value,
        source: "derived",
        quality: "derived",
        warnings: ["Derived from annual value minus reported Q1-Q3."],
        tag: `derived:${definition.key}:q4`
      };
    })
    .filter((point): point is FinancialDataPoint => point !== null);

  return {
    points: [...quarterly, ...derived].sort(comparePointsByEnd),
    warnings
  };
}

function validateMetricPoints(
  definition: MetricDefinition,
  period: FinancialPeriod,
  points: FinancialDataPoint[]
): NormalizedResult {
  const warnings: string[] = [];
  const cleaned = points.filter((point) => {
    if (!Number.isFinite(point.value)) {
      warnings.push(`${definition.label}: omitted ${period} point ending ${point.end}; value is not finite.`);
      return false;
    }

    if (definition.nonNegative && point.value < 0) {
      warnings.push(`${definition.label}: omitted negative ${period} point ending ${point.end}.`);
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

    warnings.push(`${definition.label}: deduplicated ${period} point ending ${point.end}.`);
    byEnd.set(point.end, preferFinancialPoint(point, current));
  }

  return {
    points: Array.from(byEnd.values()).sort(comparePointsByEnd),
    warnings: uniqueWarnings(warnings)
  };
}

function annualQuarterSumWarnings(
  definition: MetricDefinition,
  annual: FinancialDataPoint[],
  quarterly: FinancialDataPoint[]
) {
  if (definition.kind !== "duration") return [];
  const warnings: string[] = [];

  for (const annualPoint of annual) {
    if (!annualPoint.start) continue;
    const sameFiscalWindow = quarterly.filter(
      (point) => point.end > annualPoint.start! && point.end <= annualPoint.end
    );
    const quarters = QUARTER_PERIODS.map((period) =>
      sameFiscalWindow.find((point) => point.fiscalPeriod === period)
    );
    if (quarters.some((point) => !point)) continue;

    const quarterTotal = quarters.reduce((total, point) => total + (point?.value ?? 0), 0);
    const tolerance = Math.max(Math.abs(annualPoint.value) * 0.01, 1_000_000);
    if (Math.abs(annualPoint.value - quarterTotal) > tolerance) {
      warnings.push(
        `${definition.label}: annual value does not match quarterly sum for ${annualPoint.end}.`
      );
    }
  }

  return warnings;
}

function cleanQuarterPeriod(value: string | null) {
  return QUARTER_PERIODS.includes(value ?? "") ? value : null;
}

function preferFinancialPoint(
  next: FinancialDataPoint,
  current: FinancialDataPoint
) {
  if (next.source !== current.source) {
    return next.source === "reported" ? next : current;
  }

  return next.filed.localeCompare(current.filed) > 0 ? next : current;
}

function compareFactPreference(
  next: FactCandidate,
  current: FactCandidate,
  period: FinancialPeriod
) {
  if (next.tagPriority !== current.tagPriority) {
    return current.tagPriority - next.tagPriority;
  }

  const nextScore = factPreferenceScore(next, period);
  const currentScore = factPreferenceScore(current, period);
  if (nextScore !== currentScore) return nextScore - currentScore;

  return String(next.filed ?? "").localeCompare(String(current.filed ?? ""));
}

function factPreferenceScore(fact: FactCandidate, period: FinancialPeriod) {
  let score = 0;

  if (period === "annual") {
    if (fact.form === "10-K") score += 4;
    if (fact.fp === "FY") score += 2;
    if (/^CY\d{4}$/.test(fact.frame ?? "")) score += 1;
    return score;
  }

  if (fact.form === "10-Q") score += 4;
  if (fact.form === "10-K") score += 3;
  if (/^Q[1-4]$/.test(fact.fp ?? "")) score += 2;
  if (/^CY\d{4}Q[1-4]I?$/.test(fact.frame ?? "")) score += 1;
  return score;
}

function isEarlierFiledFact(next: CompanyFactUnit, current: CompanyFactUnit) {
  return String(next.filed ?? "").localeCompare(String(current.filed ?? "")) < 0;
}

function comparePointsByEnd(a: FinancialDataPoint, b: FinancialDataPoint) {
  return a.end.localeCompare(b.end);
}

function uniqueWarnings(warnings: string[]) {
  return Array.from(new Set(warnings));
}
