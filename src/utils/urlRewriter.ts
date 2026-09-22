import { acquireRewriter } from './xhrService';

type UrlRewriter = (url: string) => string;
const owner = Symbol('environment-url-rewriter');
let current: UrlRewriter | null = null;
let release: (() => void) | undefined;

export function getUrlRewriter(): UrlRewriter | null {
  return current;
}

export function setUrlRewriter(rewriter: UrlRewriter | null): void {
  if (!rewriter) {
    release?.();
    release = undefined;
    current = null;
    return;
  }
  const nextRelease = acquireRewriter(owner, rewriter);
  release?.();
  release = nextRelease;
  current = rewriter;
}
