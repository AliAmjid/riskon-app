import { parseCsvRecords, type CsvRecord } from './csv';

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

export function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned === '' || cleaned.toLowerCase() === 'none') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** The agent writes Python literals, so `True` has to count as true. */
export function toBool(raw: string | undefined): boolean | null {
  if (raw == null) return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === '') return null;
  if (['true', '1', 'yes', 'y'].includes(cleaned)) return true;
  if (['false', '0', 'no', 'n', 'none'].includes(cleaned)) return false;
  return null;
}

function looksNumeric(values: string[]): boolean {
  const filled = values.filter((value) => value.trim() !== '');
  if (!filled.length) return false;
  return filled.every((value) => toNumber(value) !== null);
}

/**
 * Fixed to en-US rather than the browser's locale: the report the agent writes
 * formats its own numbers this way, and a page that says "249 648" beside a
 * report saying "249,648" looks like two different figures.
 */
export function formatNumber(value: number, maxDecimals = 2): string {
  const decimals = Number.isInteger(value) ? 0 : maxDecimals;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

// ---------------------------------------------------------------------------
// Limits (constraints.csv)
// ---------------------------------------------------------------------------

export interface Limit {
  key: string;
  /** The rule as a sentence, which is what the reader should see. */
  rule: string;
  expression: string;
  sense: string;
  bound: number | null;
  achieved: number | null;
  slack: number | null;
  binding: boolean;
  satisfied: boolean | null;
  /** True when bound and achieved are shares and should read as percentages. */
  asShare: boolean;
}

export interface Limits {
  rules: Limit[];
  bindingCount: number;
  violated: Limit[];
}

/**
 * A share constraint stores 0.5 and means "half". Nothing in the CSV marks it
 * as a ratio, so we take the cue from the sentence the agent wrote: every
 * share rule the templates emit phrases the bound as a percentage.
 */
function isShareRule(rule: string, bound: number | null): boolean {
  return bound != null && Math.abs(bound) <= 1 && /%/.test(rule);
}

export function readLimits(text: string): Limits | null {
  let parsed;
  try {
    parsed = parseCsvRecords(text);
  } catch {
    return null;
  }
  if (!parsed.records.length) return null;

  const rules = parsed.records.map((record): Limit => {
    const bound = toNumber(record.bound);
    const rule = record.business_rule || record.name || 'Unnamed rule';
    return {
      key: record.name || rule,
      rule,
      expression: record.expression ?? '',
      sense: record.sense ?? '',
      bound,
      achieved: toNumber(record.achieved),
      slack: toNumber(record.slack),
      binding: toBool(record.binding) ?? false,
      // blend_lp omits the column entirely, so absent means "not reported".
      satisfied: toBool(record.satisfied),
      asShare: isShareRule(rule, bound),
    };
  });

  return {
    rules,
    bindingCount: rules.filter((rule) => rule.binding).length,
    violated: rules.filter((rule) => rule.satisfied === false),
  };
}

export function formatLimitValue(limit: Limit, value: number | null): string {
  if (value == null) return '—';
  if (limit.asShare) return `${formatNumber(value * 100, 1)}%`;
  return formatNumber(value);
}

/** How the reader should hear this rule's status. */
export function limitVerdict(limit: Limit): string {
  if (limit.satisfied === false) return 'Broken';
  if (limit.binding) return 'At its limit';
  if (limit.slack == null) return 'Room to spare';
  const room = formatLimitValue(limit, Math.abs(limit.slack));
  return limit.sense === '>=' ? `${room} above the floor` : `${room} to spare`;
}

// ---------------------------------------------------------------------------
// The decision (decision.csv)
// ---------------------------------------------------------------------------

export interface Decision {
  headers: string[];
  /** Every row the file carried, which for older runs is the whole candidate set. */
  all: CsvRecord[];
  /** The rows that actually form the answer. */
  chosen: CsvRecord[];
  selectionColumn: string | null;
  quantityColumn: string | null;
  labelColumn: string | null;
  categoryColumn: string | null;
  moneyColumn: string | null;
  valueColumn: string | null;
  numericColumns: string[];
  /** True when quantities are real amounts rather than 0/1 picks. */
  weighted: boolean;
}

const SELECTION_NAMES = ['selected', 'chosen', 'is_selected', 'assign'];
const QUANTITY_NAMES = ['quantity', 'qty', 'amount', 'units', 'volume'];
const LABEL_NAMES = ['label', 'name', 'item', 'model', 'driver', 'worker', 'shift', 'title'];
const CATEGORY_NAMES = ['category', 'group', 'segment', 'region', 'origin', 'cut', 'class', 'type', 'grade'];
const MONEY_NAMES = ['cost', 'unit_cost', 'price', 'spend', 'unit_price', 'outlay'];
const VALUE_NAMES = ['value', 'score', 'revenue', 'profit', 'margin', 'weight', 'capacity'];

function pick(headers: string[], preferred: string[]): string | null {
  for (const name of preferred) {
    const match = headers.find((header) => header.toLowerCase() === name);
    if (match) return match;
  }
  return null;
}

export function readDecision(text: string): Decision | null {
  let parsed;
  try {
    parsed = parseCsvRecords(text);
  } catch {
    return null;
  }
  const { headers, records } = parsed;
  if (!records.length) return null;

  const numericColumns = headers.filter(
    (header) =>
      header.toLowerCase() !== 'row_id' &&
      looksNumeric(records.map((record) => record[header])),
  );

  const selectionColumn = pick(headers, SELECTION_NAMES);
  const quantityColumn = pick(headers, QUANTITY_NAMES);

  const isChosen = (record: CsvRecord): boolean => {
    if (selectionColumn) {
      const flag = record[selectionColumn];
      return toBool(flag) ?? (toNumber(flag) ?? 0) !== 0;
    }
    if (quantityColumn) return (toNumber(record[quantityColumn]) ?? 0) > 0;
    return true;
  };

  const chosen = records.filter(isChosen);

  // Distinguish "buy 5 of these" from "buy this one": only real amounts should
  // scale the per-unit columns when they are totalled.
  const quantities = quantityColumn
    ? chosen.map((record) => toNumber(record[quantityColumn]) ?? 0)
    : [];
  const weighted = quantities.some((value) => value !== 0 && value !== 1);

  const textColumns = headers.filter(
    (header) =>
      header.toLowerCase() !== 'row_id' &&
      !numericColumns.includes(header) &&
      header !== selectionColumn,
  );

  const categoryColumn =
    pick(textColumns, CATEGORY_NAMES) ??
    textColumns.find((header) => {
      const distinct = new Set(chosen.map((record) => record[header])).size;
      return distinct >= 2 && distinct <= 12;
    }) ??
    null;

  const labelColumn =
    pick(headers, LABEL_NAMES) ??
    textColumns.find((header) => {
      if (header === categoryColumn) return false;
      return new Set(chosen.map((record) => record[header])).size > 12;
    }) ??
    null;

  return {
    headers,
    all: records,
    chosen: chosen.length ? chosen : records,
    selectionColumn,
    quantityColumn,
    labelColumn,
    categoryColumn,
    moneyColumn: pick(numericColumns, MONEY_NAMES),
    valueColumn: pick(numericColumns, VALUE_NAMES),
    numericColumns,
    weighted,
  };
}

/** How many units of a row the answer takes. */
export function weightOf(decision: Decision, record: CsvRecord): number {
  if (!decision.weighted || !decision.quantityColumn) return 1;
  return toNumber(record[decision.quantityColumn]) ?? 0;
}

/** A per-unit column totalled across the answer. */
export function totalOf(decision: Decision, column: string | null): number | null {
  if (!column) return null;
  let total = 0;
  let seen = false;
  for (const record of decision.chosen) {
    const value = toNumber(record[column]);
    if (value == null) continue;
    seen = true;
    total += value * weightOf(decision, record);
  }
  return seen ? total : null;
}

/** A name for one chosen row: its own label, or the grades that describe it. */
export function labelOf(decision: Decision, record: CsvRecord): string {
  if (decision.labelColumn && record[decision.labelColumn]) {
    return record[decision.labelColumn];
  }
  const descriptors = decision.headers.filter(
    (header) =>
      header.toLowerCase() !== 'row_id' &&
      header !== decision.selectionColumn &&
      header !== decision.quantityColumn &&
      !decision.numericColumns.includes(header),
  );
  const parts = descriptors.map((header) => record[header]).filter(Boolean);
  return parts.length ? parts.join(' · ') : `Row ${record.row_id ?? '?'}`;
}

export interface Slice {
  label: string;
  value: number;
  share: number;
}

/** The answer grouped by its category column, largest group first. */
export function composition(
  decision: Decision,
  column: string | null,
): Slice[] {
  const key = column ?? decision.categoryColumn;
  if (!key) return [];

  const measure = decision.moneyColumn ?? decision.valueColumn;
  const groups = new Map<string, number>();

  for (const record of decision.chosen) {
    const name = record[key] || 'Unspecified';
    const unit = measure ? (toNumber(record[measure]) ?? 0) : 1;
    const contribution = measure ? unit * weightOf(decision, record) : weightOf(decision, record);
    groups.set(name, (groups.get(name) ?? 0) + contribution);
  }

  const total = [...groups.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];

  return [...groups.entries()]
    .map(([label, value]) => ({ label, value, share: value / total }))
    .sort((a, b) => b.value - a.value);
}

/**
 * The individual choices that account for most of the commitment.
 *
 * Rows that describe the same thing are merged. Without a label column the
 * name is composed from the grades that describe a row, and a blend can hold
 * several rows of the same grade — listing them separately would show five
 * identical bars instead of one real total.
 */
export function contributions(decision: Decision, limit = 10): Slice[] {
  const measure = decision.moneyColumn ?? decision.valueColumn;
  if (!measure) return [];

  const merged = new Map<string, number>();
  for (const record of decision.chosen) {
    const label = labelOf(decision, record);
    const value = (toNumber(record[measure]) ?? 0) * weightOf(decision, record);
    merged.set(label, (merged.get(label) ?? 0) + value);
  }

  const total = [...merged.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];

  return [...merged.entries()]
    .map(([label, value]) => ({ label, value, share: value / total }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// summary.json — optional, published alongside the rest
// ---------------------------------------------------------------------------

export interface Assumption {
  confidence: 'CONFIRMED' | 'DECLINED' | 'GUESSED' | 'UNMARKED';
  text: string;
}

export interface RunSummary {
  status: string | null;
  objective: number | null;
  objectiveLabel: string | null;
  solver: string | null;
  model: string | null;
  runtimeSeconds: number | null;
  sourceRows: number | null;
  candidateRows: number | null;
  assumptions: Assumption[];
}

const CONFIDENCES = ['CONFIRMED', 'DECLINED', 'GUESSED'] as const;

function readAssumption(entry: unknown): Assumption | null {
  if (typeof entry === 'string') {
    const marker = CONFIDENCES.find((name) => entry.startsWith(`${name}:`));
    return marker
      ? { confidence: marker, text: entry.slice(marker.length + 1).trim() }
      : { confidence: 'UNMARKED', text: entry.trim() };
  }
  if (entry && typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text : null;
    if (!text) return null;
    const raw = String(record.confidence ?? '').toUpperCase();
    const confidence = CONFIDENCES.find((name) => name === raw) ?? 'UNMARKED';
    return { confidence, text };
  }
  return null;
}

export function readSummary(text: string): RunSummary | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;

  const str = (key: string): string | null =>
    typeof body[key] === 'string' && body[key] !== '' ? (body[key] as string) : null;
  const num = (key: string): number | null => {
    const value = body[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') return toNumber(value);
    return null;
  };

  const raw = Array.isArray(body.assumptions) ? body.assumptions : [];

  return {
    status: str('status'),
    objective: num('objective'),
    objectiveLabel: str('objective_label') ?? str('objectiveLabel'),
    solver: str('solver'),
    model: str('model'),
    runtimeSeconds: num('runtime_seconds') ?? num('runtimeSeconds'),
    sourceRows: num('source_rows') ?? num('sourceRows'),
    candidateRows: num('candidates_rows') ?? num('candidateRows'),
    assumptions: raw
      .map(readAssumption)
      .filter((entry): entry is Assumption => entry !== null),
  };
}
