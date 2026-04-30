type UrlRewriter = (url: string) => string;

let current: UrlRewriter | null = null;

export const urlRewriter = {
  get: (): UrlRewriter | null => current,
  set: (rewriter: UrlRewriter | null): void => {
    current = rewriter;
  },
};
