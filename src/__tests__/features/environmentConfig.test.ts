import { normalizeEnvironment } from '../../features/environment/environmentConfig';
import { normalizeConfig } from '../../core/config';

const prod = { id: 'prod', title: 'Production', urls: { api: 'https://prod.test/api' } };
const qa = { id: 'qa', title: 'QA', urls: { api: 'https://qa.test/api' } };

test.each([undefined, {}, { items: [] }, { defaultId: 'dev' }])('missing supply is empty: %p', input => {
  expect(normalizeEnvironment(input)).toEqual({ items: [], defaultId: null, issues: [] });
});
test('defaults to first item and snapshots immutable URL data', () => {
  const normalized = normalizeEnvironment({ items: [prod, qa] });
  expect(normalized.defaultId).toBe('prod');
  expect(normalized.issues).toEqual([]);
  expect(normalized.items[0]).not.toBe(prod);
  expect(Object.isFrozen(normalized.items[0]?.urls)).toBe(true);
});
test.each([
  [{ items: [prod, prod] }, 'environment.items[1].id'],
  [{ items: [{ ...prod, id: '' }] }, 'environment.items[0].id'],
  [{ items: [{ ...prod, title: '' }] }, 'environment.items[0].title'],
  [{ items: [{ ...prod, urls: {} }] }, 'environment.items[0].urls'],
  [{ items: [{ ...prod, urls: { api: '/api' } }] }, 'environment.items[0].urls.api'],
  [{ items: [{ ...prod, urls: { api: 'ftp://prod.test/api' } }] }, 'environment.items[0].urls.api'],
  [{ items: [{ ...prod, urls: { api: 'https://prod.test/api', other: 'https://prod.test/api/' } }] }, 'environment.items[0].urls.other'],
  [{ items: [prod, { ...qa, urls: { auth: 'https://qa.test' } }] }, 'environment.items[1].urls'],
  [{ items: [prod], defaultId: 'missing' }, 'environment.defaultId'],
  [{ items: [null] }, 'environment.items[0]'],
])('rejects malformed supplied configuration with path: %p', (input, path) => {
  expect(normalizeEnvironment(input).issues).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
  expect(normalizeConfig({ environment: input }).features.environment.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
});
test('rejects old host arrays and unknown environment fields', () => {
  expect(normalizeEnvironment([{ id: 'prod', host: 'prod.test' }]).issues[0]?.path).toBe('environment');
  expect(normalizeEnvironment({ items: [{ ...prod, label: 'old' }] }).issues[0]?.path).toBe('environment.items[0].label');
});
test.each([/unexpected/, new Date(), new Map(), Object.create({ inherited: true })])('rejects non-plain feature objects: %p', input => {
  expect(normalizeEnvironment(input)).toMatchObject({
    items: [], defaultId: null, issues: [expect.objectContaining({ path: 'environment' })],
  });
  expect(normalizeConfig({ environment: input }).features.environment).toMatchObject({
    enabled: true, options: { items: [], defaultId: null },
    issues: [expect.objectContaining({ path: 'environment' })],
  });
});
test.each([{}, Object.create(null)])('accepts empty plain and null-prototype objects: %p', input => {
  expect(normalizeConfig({ environment: input }).features.environment).toMatchObject({
    enabled: true, options: { items: [], defaultId: null }, issues: [],
  });
});
