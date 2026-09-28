import type { ArxivId } from './types';

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
