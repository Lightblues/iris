export type UrlMatcher = string | RegExp | ((url: string) => boolean);

export interface EnhancementAction {
  name: string;
  icon: string;
  url: string;
}

export interface EnhancementResult {
  /** Header text shown in the menu (e.g., "arXiv: 2511.01824") */
  header: string;
  /** List of navigation actions */
  actions: EnhancementAction[];
}

export interface EnhancementHandler {
  /** Unique identifier for the handler */
  id: string;
  /** Human-readable name */
  name: string;
  /** URL matcher - can be string prefix, RegExp, or function */
  match: UrlMatcher;
  /** Get enhancement actions for the URL (returns null if not applicable) */
  getActions: (url: string) => EnhancementResult | null;
}

export interface ArxivId {
  /** Full ID with version suffix (e.g., "2511.01824v1") */
  full: string;
  /** Base ID without version suffix (e.g., "2511.01824") */
  base: string;
  /** Version number if present (e.g., "1"), undefined if no version */
  version?: string;
}
