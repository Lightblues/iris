import type { ArxivId, EnhancementHandler, EnhancementResult } from './types';

/**
 * Extract arXiv ID from URL
 * Supports: arxiv.org, alphaxiv.org, huggingface.co/papers, papers.cool/arxiv
 */
export function extractArxivId(url: string): ArxivId | null {
  // Try matching standard arXiv URLs
  const arxivRegex = /arxiv\.org\/(?:abs|html|pdf|ftp)\/(\d+\.\d+)(v\d+)?/i;
  const arxivMatch = url.match(arxivRegex);
  if (arxivMatch) {
    const baseId = arxivMatch[1];
    const version = arxivMatch[2] ? arxivMatch[2].substring(1) : undefined;
    return { full: version ? `${baseId}v${version}` : baseId, base: baseId, version };
  }

  // Try matching alphaXiv
  const alphaxivRegex = /alphaxiv\.org\/abs\/(\d+\.\d+)/i;
  const alphaxivMatch = url.match(alphaxivRegex);
  if (alphaxivMatch) {
    return { full: alphaxivMatch[1], base: alphaxivMatch[1] };
  }

  // Try matching HuggingFace Papers
  const hfRegex = /huggingface\.co\/papers\/(\d+\.\d+)/i;
  const hfMatch = url.match(hfRegex);
  if (hfMatch) {
    return { full: hfMatch[1], base: hfMatch[1] };
  }

  // Try matching papers.cool
  const coolRegex = /papers\.cool\/arxiv\/(\d+\.\d+)/i;
  const coolMatch = url.match(coolRegex);
  if (coolMatch) {
    return { full: coolMatch[1], base: coolMatch[1] };
  }

  return null;
}

export function createArxivEnhancement(): EnhancementHandler {
  const arxivDomains = [
    'arxiv.org',
    'alphaxiv.org',
    'huggingface.co/papers',
    'papers.cool/arxiv'
  ];

  return {
    id: 'arxiv-enhancement',
    name: 'arXiv Paper Enhancement',
    match: (url: string) => arxivDomains.some(domain => url.includes(domain)) && /\d+\.\d+/.test(url),
    getActions: (url: string): EnhancementResult | null => {
      const arxivId = extractArxivId(url);
      if (!arxivId) return null;

      return {
        header: `arXiv: ${arxivId.base}`,
        actions: [
          { name: 'arXiv', icon: '📝', url: `https://arxiv.org/abs/${arxivId.base}` },
          { name: 'alphaXiv', icon: 'α', url: `https://www.alphaxiv.org/abs/${arxivId.base}` },
          { name: 'papers.cool', icon: '🔬', url: `https://papers.cool/arxiv/${arxivId.base}` },
          { name: 'HuggingFace', icon: '🤗', url: `https://huggingface.co/papers/${arxivId.base}` }
        ]
      };
    }
  };
}
