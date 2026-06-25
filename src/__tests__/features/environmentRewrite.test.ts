import {
  buildManagedUrlRewriter,
  rewriteByLongestPrefix,
} from '../../features/environment/urlPrefixRewrite';
import type { DebugEnvironment } from '../../types';

const prod: DebugEnvironment = {
  id: 'prod',
  label: 'Production',
  urls: {
    app: 'https://api.example.com',
    shop: 'https://api.example.com/shop',
    auth: 'https://auth.example.com',
  },
};

const qa: DebugEnvironment = {
  id: 'qa',
  label: 'QA',
  urls: {
    app: 'https://qa-api.example.com',
    shop: 'https://qa-api.example.com/shop',
    auth: 'https://qa-auth.example.com',
  },
};

describe('managed environment URL rewrite', () => {
  it('rewrites default app URL to selected app URL', () => {
    expect(
      rewriteByLongestPrefix(
        'https://api.example.com/users?active=1#top',
        prod.urls,
        qa.urls,
      ),
    ).toBe('https://qa-api.example.com/users?active=1#top');
  });

  it('uses longest prefix when services share host', () => {
    expect(
      rewriteByLongestPrefix(
        'https://api.example.com/shop/products?x=1',
        prod.urls,
        qa.urls,
      ),
    ).toBe('https://qa-api.example.com/shop/products?x=1');
  });

  it('does not match partial path segment', () => {
    expect(
      rewriteByLongestPrefix(
        'https://api.example.com/shopping/cart',
        { shop: 'https://api.example.com/shop' },
        { shop: 'https://qa-api.example.com/shop' },
      ),
    ).toBe('https://api.example.com/shopping/cart');
  });

  it('keeps URL unchanged when selected env lacks matching key', () => {
    expect(
      rewriteByLongestPrefix(
        'https://auth.example.com/login',
        { auth: 'https://auth.example.com' },
        { app: 'https://qa-api.example.com' },
      ),
    ).toBe('https://auth.example.com/login');
  });

  it('keeps invalid and relative URLs unchanged', () => {
    expect(rewriteByLongestPrefix('/relative/path', prod.urls, qa.urls)).toBe('/relative/path');
    expect(rewriteByLongestPrefix('not a url', prod.urls, qa.urls)).toBe('not a url');
  });

  it('does not rewrite when selected environment is default environment', () => {
    const rewriter = buildManagedUrlRewriter(prod, prod);
    expect(rewriter).toBeNull();
  });

  it('builds rewriter from two environments', () => {
    const rewriter = buildManagedUrlRewriter(prod, qa);
    expect(rewriter!('https://auth.example.com/oauth/token')).toBe('https://qa-auth.example.com/oauth/token');
  });
});
