export type ExtractProvider = 'gemini' | 'chatgpt' | 'claude';

export interface CachedExtract {
  data: any;
  at: number;
  provider: ExtractProvider;
}

const cache = new Map<string, CachedExtract>();
// In-flight registry: ensures only one extract runs per PDF path across routes/services
const inflight = new Map<string, Promise<any>>();

export function normalizeKey(filePath: string): string {
  try {
    return require('path').resolve(filePath);
  } catch {
    return filePath;
  }
}

export function getExtract(filePath: string): CachedExtract | undefined {
  return cache.get(normalizeKey(filePath));
}

export function setExtract(filePath: string, value: CachedExtract): void {
  cache.set(normalizeKey(filePath), value);
}

export function clearExtract(filePath?: string): void {
  if (!filePath) {
    cache.clear();
    return;
  }
  cache.delete(normalizeKey(filePath));
}

// New: in-flight helpers
export function getInFlight(filePath: string): Promise<any> | undefined {
  return inflight.get(normalizeKey(filePath));
}

export function setInFlight(filePath: string, value: Promise<any>): void {
  inflight.set(normalizeKey(filePath), value);
}

export function clearInFlight(filePath?: string): void {
  if (!filePath) {
    inflight.clear();
    return;
  }
  inflight.delete(normalizeKey(filePath));
}
