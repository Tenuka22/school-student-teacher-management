export interface ImportConflict<T = Record<string, unknown>> {
  /** Unique id for this staged conflict (not the record id). */
  conflictId: string;
  /** Existing record id being updated. */
  recordId: string;
  /** The record as it currently exists on the server. */
  current: T;
  /** The record as read from the imported CSV row. */
  incoming: T;
  importedAt: string;
}

const storageKey = (namespace: string) => `import-conflicts:${namespace}`;

/** Reads every staged (unresolved) import conflict for a namespace (e.g. "teachers"). */
export const getImportConflicts = <T = Record<string, unknown>>(
  namespace: string
): ImportConflict<T>[] => {
  const raw = localStorage.getItem(storageKey(namespace));
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as ImportConflict<T>[];
  } catch {
    return [];
  }
};

/** Appends new conflicts to whatever is already staged for a namespace. */
export const addImportConflicts = <T = Record<string, unknown>>(
  namespace: string,
  conflicts: ImportConflict<T>[]
) => {
  const existing = getImportConflicts<T>(namespace);
  localStorage.setItem(
    storageKey(namespace),
    JSON.stringify([...existing, ...conflicts])
  );
};

/** Removes one staged conflict (after it's been applied or discarded). */
export const removeImportConflict = (namespace: string, conflictId: string) => {
  const remaining = getImportConflicts(namespace).filter(
    (conflict) => conflict.conflictId !== conflictId
  );
  localStorage.setItem(storageKey(namespace), JSON.stringify(remaining));
};

/** Clears every staged conflict for a namespace. */
export const clearImportConflicts = (namespace: string) => {
  localStorage.removeItem(storageKey(namespace));
};
