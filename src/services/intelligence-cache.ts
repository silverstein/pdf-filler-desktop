import { IntelligenceResult } from './pdf-intelligence.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Intelligence Cache Service
 * 
 * Caches PDF intelligence results with the following validation rules:
 * 1. Cache expires after 6 months (180 days)
 * 2. Cache invalidates if file size or modification time changes
 * 3. Cache invalidates if file is deleted or inaccessible
 * 
 * This ensures users get fresh analysis periodically while maintaining
 * excellent performance for frequently accessed files.
 */

export interface CachedIntelligence {
  data: IntelligenceResult;
  at: number;
  fileSize: number;
  fileMtime: number;
}

const cache = new Map<string, CachedIntelligence>();
// In-flight registry: ensures only one intelligence analysis runs per PDF path
const inflight = new Map<string, Promise<IntelligenceResult>>();

export function normalizeKey(filePath: string): string {
  try {
    return path.resolve(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Get cached intelligence if still valid for the file
 */
export function getIntelligence(filePath: string): CachedIntelligence | undefined {
  const key = normalizeKey(filePath);
  const cached = cache.get(key);
  
  if (!cached) return undefined;
  
  // Check if cache is older than 6 months (180 days)
  const sixMonthsInMs = 180 * 24 * 60 * 60 * 1000;
  const cacheAge = Date.now() - cached.at;
  if (cacheAge > sixMonthsInMs) {
    console.log(`[Intelligence Cache] Expired after 6 months for ${filePath}`);
    cache.delete(key);
    return undefined;
  }
  
  // Validate that file hasn't changed
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileMtime = stats.mtime.getTime();
    
    // If file has been modified or size changed, cache is invalid
    if (cached.fileSize !== fileSize || cached.fileMtime !== fileMtime) {
      cache.delete(key);
      return undefined;
    }
    
    return cached;
  } catch {
    // File doesn't exist or can't be accessed
    cache.delete(key);
    return undefined;
  }
}

/**
 * Set intelligence cache with file metadata for validation
 */
export function setIntelligence(filePath: string, value: IntelligenceResult): void {
  const key = normalizeKey(filePath);
  
  try {
    const stats = fs.statSync(filePath);
    const cached: CachedIntelligence = {
      data: value,
      at: Date.now(),
      fileSize: stats.size,
      fileMtime: stats.mtime.getTime()
    };
    cache.set(key, cached);
  } catch {
    // If we can't get file stats, don't cache
  }
}

/**
 * Clear intelligence cache for a specific file or all files
 */
export function clearIntelligence(filePath?: string): void {
  if (!filePath) {
    cache.clear();
    return;
  }
  cache.delete(normalizeKey(filePath));
}

// In-flight helpers to prevent duplicate concurrent analyses
export function getInFlight(filePath: string): Promise<IntelligenceResult> | undefined {
  return inflight.get(normalizeKey(filePath));
}

export function setInFlight(filePath: string, value: Promise<IntelligenceResult>): void {
  inflight.set(normalizeKey(filePath), value);
}

export function clearInFlight(filePath?: string): void {
  if (!filePath) {
    inflight.clear();
    return;
  }
  inflight.delete(normalizeKey(filePath));
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; files: string[] } {
  return {
    size: cache.size,
    files: Array.from(cache.keys())
  };
}