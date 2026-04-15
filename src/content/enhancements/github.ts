import type { EnhancementHandler, EnhancementResult } from './types';

/**
 * Extract GitHub repo info from URL
 * Supports: github.com/{owner}/{repo}, deepwiki.com/{owner}/{repo}
 */
export function extractGitHubRepo(url: string): { owner: string; repo: string } | null {
  // Match GitHub URLs: github.com/owner/repo (ignore special paths)
  const githubRegex = /github\.com\/([^\/]+)\/([^\/\?#]+)/i;
  const githubMatch = url.match(githubRegex);
  if (githubMatch) {
    const owner = githubMatch[1];
    const repo = githubMatch[2];
    // Ignore special GitHub pages
    const ignoredOwners = ['settings', 'notifications', 'new', 'orgs', 'marketplace', 'explore', 'topics', 'trending', 'collections', 'events', 'sponsors', 'login', 'signup', 'pricing', 'features', 'security', 'enterprise', 'team', 'customer-stories', 'readme', 'about'];
    if (ignoredOwners.includes(owner.toLowerCase())) return null;
    return { owner, repo };
  }

  // Match DeepWiki URLs: deepwiki.com/owner/repo
  const deepwikiRegex = /deepwiki\.com\/([^\/]+)\/([^\/\?#]+)/i;
  const deepwikiMatch = url.match(deepwikiRegex);
  if (deepwikiMatch) {
    return { owner: deepwikiMatch[1], repo: deepwikiMatch[2] };
  }

  return null;
}

export function createGitHubEnhancement(): EnhancementHandler {
  return {
    id: 'github-enhancement',
    name: 'GitHub ↔ DeepWiki Enhancement',
    match: (url: string) => {
      return (url.includes('github.com/') || url.includes('deepwiki.com/')) && extractGitHubRepo(url) !== null;
    },
    getActions: (url: string): EnhancementResult | null => {
      const repo = extractGitHubRepo(url);
      if (!repo) return null;

      const repoPath = `${repo.owner}/${repo.repo}`;
      const isGitHub = url.includes('github.com');

      return {
        header: repoPath,
        actions: isGitHub
          ? [
              { name: 'DeepWiki', icon: '📖', url: `https://deepwiki.com/${repoPath}` }
            ]
          : [
              { name: 'GitHub', icon: '🐙', url: `https://github.com/${repoPath}` }
            ]
      };
    }
  };
}
