
const DRAFT_PREFIX = "campusiq:draft:v1:";

export interface DraftRecord<T> {
  version: 1;
  savedAt: number;
  data: T;
}

function getStorageKey(key: string): string {
  return `${DRAFT_PREFIX}${key}`;
}

/**
 * Saves an unfinished form locally on this device.
 * Never pass passwords, tokens, or other authentication secrets.
 */
export function saveDraft<T>(key: string, data: T): boolean {
  try {
    const record: DraftRecord<T> = {
      version: 1,
      savedAt: Date.now(),
      data,
    };

    localStorage.setItem(getStorageKey(key), JSON.stringify(record));
    return true;
  } catch {
    // Storage can be unavailable or full.
    return false;
  }
}

/** Returns a saved draft, or null when no usable draft exists. */
export function loadDraft<T>(key: string): DraftRecord<T> | null {
  try {
    const raw = localStorage.getItem(getStorageKey(key));
    if (!raw) return null;

    const record: unknown = JSON.parse(raw);

    if (
      typeof record !== "object" ||
      record === null ||
      !("version" in record) ||
      record.version !== 1 ||
      !("savedAt" in record) ||
      typeof record.savedAt !== "number" ||
      !("data" in record)
    ) {
      return null;
    }

    return record as DraftRecord<T>;
  } catch {
    return null;
  }
}

/** Deletes only the specified draft. */
export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(getStorageKey(key));
  } catch {
    // Ignore unavailable browser storage.
  }
}
