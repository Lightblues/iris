import type { UrlMatcher, EnhancementHandler, EnhancementResult } from './types';
export type { EnhancementAction, EnhancementResult } from './types';

class EnhancementRegistry {
  private handlers: EnhancementHandler[] = [];

  register(handler: EnhancementHandler): void {
    this.handlers.push(handler);
  }

  unregister(id: string): void {
    this.handlers = this.handlers.filter(h => h.id !== id);
  }

  private matches(matcher: UrlMatcher, url: string): boolean {
    if (typeof matcher === 'string') {
      return url.startsWith(matcher);
    } else if (matcher instanceof RegExp) {
      return matcher.test(url);
    } else if (typeof matcher === 'function') {
      return matcher(url);
    }
    return false;
  }

  /** Get all enhancement actions for a URL from all matching handlers */
  getActionsForUrl(url: string): EnhancementResult[] {
    const results: EnhancementResult[] = [];
    for (const handler of this.handlers) {
      if (this.matches(handler.match, url)) {
        const result = handler.getActions(url);
        if (result) {
          results.push(result);
        }
      }
    }
    return results;
  }
}

// Global registry instance
export const enhancementRegistry = new EnhancementRegistry();
