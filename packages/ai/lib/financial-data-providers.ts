export type FinancialTimeframe = 'day' | 'week' | 'month' | 'year' | 'all';

export type NormalizedCitation = {
  url: string;
  title?: string;
  publisher?: string;
  publishedAt?: string;
};

export type NormalizedSeriesPoint = {
  date: string;
  value: number;
  sourceUrl?: string;
  sourceTitle?: string;
};

export type DeterministicSeriesResult = {
  summary: string;
  unit: string;
  insights: string[];
  latestValue: { date: string; value: number } | null;
  series: NormalizedSeriesPoint[];
  citations: NormalizedCitation[];
};

type DeterministicSeriesParams = {
  query: string;
  timeframe: FinancialTimeframe;
  period?: string;
};

type FredSeriesConfig = {
  seriesId: string;
  label: string;
  unit: string;
  keywords: string[];
};

type CoinConfig = {
  coinId: string;
  symbol: string;
  displayName: string;
  keywords: string[];
};

type DetectionResult =
  | { type: 'fred'; series: FredSeriesConfig }
  | { type: 'equity'; symbol: string }
  | { type: 'crypto'; config: CoinConfig }
  | null;

const FED_SERIES: FredSeriesConfig[] = [
  {
    seriesId: 'FEDFUNDS',
    label: 'Federal Funds Effective Rate',
    unit: 'Percent',
    keywords: [
      'fed funds',
      'federal funds rate',
      'effective federal funds',
      'fed interest rate',
      'fed funds rate',
    ],
  },
  {
    seriesId: 'DGS10',
    label: '10-Year Treasury Constant Maturity Rate',
    unit: 'Percent',
    keywords: ['10 year treasury', '10-year treasury', 'treasury yield', 'dgs10', '10y treasury'],
  },
  {
    seriesId: 'CPIAUCSL',
    label: 'Consumer Price Index for All Urban Consumers (CPI-U)',
    unit: 'Index',
    keywords: ['cpi', 'inflation rate', 'consumer price index'],
  },
];

const COIN_MAP: CoinConfig[] = [
  {
    coinId: 'bitcoin',
    symbol: 'BTC',
    displayName: 'Bitcoin',
    keywords: ['bitcoin', 'btc'],
  },
  {
    coinId: 'ethereum',
    symbol: 'ETH',
    displayName: 'Ethereum',
    keywords: ['ethereum', 'eth'],
  },
  {
    coinId: 'solana',
    symbol: 'SOL',
    displayName: 'Solana',
    keywords: ['solana', 'sol'],
  },
  {
    coinId: 'dogecoin',
    symbol: 'DOGE',
    displayName: 'Dogecoin',
    keywords: ['dogecoin', 'doge'],
  },
  {
    coinId: 'avalanche-2',
    symbol: 'AVAX',
    displayName: 'Avalanche',
    keywords: ['avalanche', 'avax'],
  },
  {
    coinId: 'ripple',
    symbol: 'XRP',
    displayName: 'XRP',
    keywords: ['xrp', 'ripple'],
  },
];

const EQUITY_CONTEXT_REGEX = /(stock|stocks|share|shares|equity|price|quote|ticker|closing)/i;
const EQUITY_BLACKLIST = new Set(['ETF', 'GDP', 'USA', 'FOMC', 'USD', 'CPI']);

const MS_PER_DAY = 86_400_000;

function formatISO(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function parseNumber(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type DateRange = {
  start: Date;
  end: Date;
  days: number;
};

function resolveDateRange(timeframe: FinancialTimeframe, period?: string): DateRange {
  const end = new Date();
  let start: Date | null = null;

  if (period) {
    const normalized = period.toLowerCase();
    const lastMatch = normalized.match(/last\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)/);
    if (lastMatch) {
      const amount = Number.parseInt(lastMatch[1], 10);
      const unit = lastMatch[2];
      start = new Date(end);
      switch (unit) {
        case 'day':
        case 'days':
          start.setUTCDate(start.getUTCDate() - amount);
          break;
        case 'week':
        case 'weeks':
          start.setUTCDate(start.getUTCDate() - amount * 7);
          break;
        case 'month':
        case 'months':
          start.setUTCMonth(start.getUTCMonth() - amount);
          break;
        case 'year':
        case 'years':
          start.setUTCFullYear(start.getUTCFullYear() - amount);
          break;
        default:
          break;
      }
    } else if (normalized.includes('ytd') || normalized.includes('year-to-date')) {
      start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
    }
  }

  if (!start) {
    start = new Date(end);
    switch (timeframe) {
      case 'day':
        start.setUTCDate(start.getUTCDate() - 2);
        break;
      case 'week':
        start.setUTCDate(start.getUTCDate() - 7);
        break;
      case 'month':
        start.setUTCMonth(start.getUTCMonth() - 1);
        break;
      case 'year':
        start.setUTCFullYear(start.getUTCFullYear() - 1);
        break;
      case 'all':
      default:
        start.setUTCFullYear(start.getUTCFullYear() - 10);
        break;
    }
  }

  if (start > end) {
    start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 7);
  }

  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY));
  return { start, end, days };
}

function computeInsights(
  series: NormalizedSeriesPoint[],
  unit: string
): { summary: string; insights: string[]; latestValue: { date: string; value: number } | null } {
  if (!series.length) {
    return {
      summary: 'No deterministic data points were available for the requested window.',
      insights: [],
      latestValue: null,
    };
  }

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const change = last.value - first.value;
  const pctChange = first.value !== 0 ? (change / first.value) * 100 : null;
  const direction = change === 0 ? 'held steady' : change > 0 ? 'rose' : 'fell';
  const absChange = Math.abs(change);
  const pctText = pctChange === null ? '' : ` (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%)`;
  const summary = `From ${formatDisplayDate(first.date)} to ${formatDisplayDate(last.date)}, values ${direction} ${absChange.toFixed(2)} ${unit}${pctText}.`;

  const values = sorted.map(point => point.value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const highPoint = sorted.find(point => point.value === maxVal);
  const lowPoint = sorted.find(point => point.value === minVal);

  const insights: string[] = [
    `Starting value: ${first.value.toFixed(2)} ${unit} on ${formatDisplayDate(first.date)}`,
    `Latest value: ${last.value.toFixed(2)} ${unit} on ${formatDisplayDate(last.date)}${pctText}`,
  ];

  if (highPoint && highPoint.date !== last.date) {
    insights.push(`Peak value of ${maxVal.toFixed(2)} ${unit} on ${formatDisplayDate(highPoint.date)}`);
  }
  if (lowPoint && lowPoint.date !== first.date) {
    insights.push(`Trough value of ${minVal.toFixed(2)} ${unit} on ${formatDisplayDate(lowPoint.date)}`);
  }

  return {
    summary,
    insights,
    latestValue: { date: last.date, value: last.value },
  };
}

function detectDeterministicSource(query: string): DetectionResult {
  if (!query) return null;
  const normalized = query.toLowerCase();

  for (const series of FED_SERIES) {
    if (series.keywords.some(keyword => normalized.includes(keyword))) {
      return { type: 'fred', series };
    }
  }

  for (const coin of COIN_MAP) {
    if (coin.keywords.some(keyword => normalized.includes(keyword))) {
      return { type: 'crypto', config: coin };
    }
  }

  if (EQUITY_CONTEXT_REGEX.test(query)) {
    const tokens = query.split(/[\s,()/]+/);
    for (const token of tokens) {
      const cleaned = token.replace(/[^A-Za-z]/g, '');
      if (!cleaned) continue;
      if (EQUITY_BLACKLIST.has(cleaned)) continue;
      if (cleaned.length >= 1 && cleaned.length <= 5 && cleaned.toUpperCase() === cleaned) {
        return { type: 'equity', symbol: cleaned };
      }
    }
  }

  return null;
}

async function fetchFredSeries(
  series: FredSeriesConfig,
  range: DateRange
): Promise<DeterministicSeriesResult | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    series_id: series.seriesId,
    observation_start: formatISO(range.start),
    observation_end: formatISO(range.end),
    api_key: apiKey,
    file_type: 'json',
  });

  try {
    const response = await fetch(`https://api.stlouisfed.org/fred/series/observations?${params.toString()}`);
    if (!response.ok) {
      console.error('[financial-data] FRED request failed', response.status);
      return null;
    }

    const data = (await response.json()) as { observations?: Array<{ date: string; value: string }> };
    const observations = Array.isArray(data.observations) ? data.observations : [];
    const seriesPoints: NormalizedSeriesPoint[] = observations
      .map(obs => {
        const value = parseNumber(obs.value);
        if (value === null) return null;
        return {
          date: obs.date,
          value,
          sourceUrl: `https://fred.stlouisfed.org/series/${series.seriesId}`,
          sourceTitle: series.label,
        };
      })
      .filter((point): point is NormalizedSeriesPoint => Boolean(point));

    if (!seriesPoints.length) {
      return null;
    }

    const stats = computeInsights(seriesPoints, series.unit);

    return {
      summary: `${series.label} ${stats.summary}`,
      unit: series.unit,
      insights: stats.insights,
      latestValue: stats.latestValue,
      series: seriesPoints,
      citations: [
        {
          url: `https://fred.stlouisfed.org/series/${series.seriesId}`,
          title: `${series.label} — Federal Reserve Bank of St. Louis`,
          publisher: 'Federal Reserve Bank of St. Louis',
        },
      ],
    };
  } catch (error) {
    console.error('[financial-data] FRED fetch error', error);
    return null;
  }
}

async function fetchPolygonSeries(
  symbol: string,
  range: DateRange
): Promise<DeterministicSeriesResult | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;

  const multiplier = 1;
  const timespan = 'day';
  const url = new URL(
    `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${formatISO(range.start)}/${formatISO(range.end)}`
  );
  url.searchParams.set('adjusted', 'true');
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('limit', '5000');
  url.searchParams.set('apiKey', apiKey);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[financial-data] Polygon request failed', response.status);
      return null;
    }
    const data = (await response.json()) as { results?: Array<{ t: number; c: number }> };
    const results = Array.isArray(data.results) ? data.results : [];
    const seriesPoints: NormalizedSeriesPoint[] = results.map(result => ({
      date: formatISO(new Date(result.t)),
      value: Number(result.c.toFixed(2)),
      sourceUrl: `https://polygon.io/ticker/${symbol}`,
      sourceTitle: `Polygon Aggregates for ${symbol}`,
    }));

    if (seriesPoints.length === 0) {
      return null;
    }

    const stats = computeInsights(seriesPoints, 'USD');

    return {
      summary: `${symbol} closing prices ${stats.summary}`,
      unit: 'USD',
      insights: stats.insights,
      latestValue: stats.latestValue,
      series: seriesPoints,
      citations: [
        {
          url: `https://polygon.io/ticker/${symbol}`,
          title: `${symbol} market data — Polygon.io`,
          publisher: 'Polygon.io',
        },
      ],
    };
  } catch (error) {
    console.error('[financial-data] Polygon fetch error', error);
    return null;
  }
}

async function fetchAlphaVantageSeries(
  symbol: string,
  range: DateRange
): Promise<DeterministicSeriesResult | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    function: 'TIME_SERIES_DAILY_ADJUSTED',
    symbol,
    outputsize: range.days > 100 ? 'full' : 'compact',
    apikey: apiKey,
  });

  try {
    const response = await fetch(`https://www.alphavantage.co/query?${params.toString()}`);
    if (!response.ok) {
      console.error('[financial-data] Alpha Vantage request failed', response.status);
      return null;
    }

    const data = (await response.json()) as Record<string, any>;
    const seriesRoot = data['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
    if (!seriesRoot) {
      return null;
    }

    const entries = Object.entries(seriesRoot)
      .map(([date, values]) => {
        const close = values['4. close'];
        const value = parseNumber(close);
        if (value === null) return null;
        return {
          date,
          value,
          sourceUrl: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}`,
          sourceTitle: `${symbol} Daily Adjusted Close — Alpha Vantage`,
        };
      })
      .filter((point): point is NormalizedSeriesPoint => Boolean(point))
      .filter(point => point.date >= formatISO(range.start) && point.date <= formatISO(range.end))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!entries.length) {
      return null;
    }

    const stats = computeInsights(entries, 'USD');

    return {
      summary: `${symbol} closing prices ${stats.summary}`,
      unit: 'USD',
      insights: stats.insights,
      latestValue: stats.latestValue,
      series: entries,
      citations: [
        {
          url: 'https://www.alphavantage.co/',
          title: 'Alpha Vantage Market Data',
          publisher: 'Alpha Vantage',
        },
      ],
    };
  } catch (error) {
    console.error('[financial-data] Alpha Vantage fetch error', error);
    return null;
  }
}

function resolveCoinDays(days: number, timeframe: FinancialTimeframe): string {
  if (timeframe === 'all') {
    return 'max';
  }
  if (days <= 1 || timeframe === 'day') return '1';
  if (days <= 7 || timeframe === 'week') return '7';
  if (days <= 30 || timeframe === 'month') return '30';
  if (days <= 90) return '90';
  if (days <= 180) return '180';
  if (days <= 365 || timeframe === 'year') return '365';
  return 'max';
}

async function fetchCoinGeckoSeries(
  config: CoinConfig,
  range: DateRange,
  timeframe: FinancialTimeframe
): Promise<DeterministicSeriesResult | null> {
  const vsCurrency = 'usd';
  const daysParam = resolveCoinDays(range.days, timeframe);
  const url = `https://api.coingecko.com/api/v3/coins/${config.coinId}/market_chart?vs_currency=${vsCurrency}&days=${daysParam}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[financial-data] CoinGecko request failed', response.status);
      return null;
    }

    const data = (await response.json()) as { prices?: Array<[number, number]> };
    const prices = Array.isArray(data.prices) ? data.prices : [];
    const seriesPoints: NormalizedSeriesPoint[] = prices.map(([timestamp, price]) => ({
      date: formatISO(new Date(timestamp)),
      value: Number(price.toFixed(2)),
      sourceUrl: `https://www.coingecko.com/en/coins/${config.coinId}`,
      sourceTitle: `${config.displayName} Price — CoinGecko`,
    }));

    const filtered = seriesPoints
      .filter(point => point.date >= formatISO(range.start) && point.date <= formatISO(range.end))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!filtered.length) {
      return null;
    }

    const stats = computeInsights(filtered, 'USD');

    return {
      summary: `${config.displayName} price ${stats.summary}`,
      unit: 'USD',
      insights: stats.insights,
      latestValue: stats.latestValue,
      series: filtered,
      citations: [
        {
          url: `https://www.coingecko.com/en/coins/${config.coinId}`,
          title: `${config.displayName} — CoinGecko`,
          publisher: 'CoinGecko',
        },
      ],
    };
  } catch (error) {
    console.error('[financial-data] CoinGecko fetch error', error);
    return null;
  }
}

async function fetchDeterministicForDetection(
  detection: Exclude<DetectionResult, null>,
  params: DeterministicSeriesParams,
  range: DateRange
): Promise<DeterministicSeriesResult | null> {
  switch (detection.type) {
    case 'fred':
      return fetchFredSeries(detection.series, range);
    case 'equity': {
      const polygonResult = await fetchPolygonSeries(detection.symbol, range);
      if (polygonResult) return polygonResult;
      return fetchAlphaVantageSeries(detection.symbol, range);
    }
    case 'crypto':
      return fetchCoinGeckoSeries(detection.config, range, params.timeframe);
    default:
      return null;
  }
}

export async function fetchDeterministicFinancialSeries(
  params: DeterministicSeriesParams
): Promise<DeterministicSeriesResult | null> {
  const detection = detectDeterministicSource(params.query);
  if (!detection) {
    return null;
  }

  const range = resolveDateRange(params.timeframe, params.period);
  const result = await fetchDeterministicForDetection(detection, params, range);
  return result;
}
