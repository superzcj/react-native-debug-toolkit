type UrlRewriter = (url: string) => string;

let _urlRewriter: UrlRewriter | null = null;

export function getUrlRewriter(): UrlRewriter | null {
  return _urlRewriter;
}

export function setUrlRewriter(rewriter: UrlRewriter | null): void {
  _urlRewriter = rewriter;
}
