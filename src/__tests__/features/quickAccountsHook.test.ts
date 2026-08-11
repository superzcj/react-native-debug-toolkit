const hookRefs: Array<{ current: unknown }> = [];
const pendingEffects: Array<() => void> = [];
let hookCursor = 0;

jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    useRef: <T,>(initialValue: T) => {
      const index = hookCursor++;
      if (!hookRefs[index]) {
        hookRefs[index] = { current: initialValue };
      }
      return hookRefs[index] as { current: T };
    },
    useEffect: (effect: () => void) => pendingEffects.push(effect),
    useLayoutEffect: (effect: () => void) => pendingEffects.push(effect),
  };
});

import { useQuickAccountsFeature } from '../../features/quickAccounts/useQuickAccountsFeature';

type Account = {
  id: string;
  label: string;
  secret: string;
};

function renderHook<T>(callback: () => T): T {
  hookCursor = 0;
  return callback();
}

function commitHook() {
  pendingEffects.splice(0).forEach((effect) => effect());
}

describe('useQuickAccountsFeature', () => {
  beforeEach(() => {
    hookRefs.length = 0;
    pendingEffects.length = 0;
    hookCursor = 0;
  });

  it('keeps one feature instance while applying the latest state and callbacks', async () => {
    const firstAccount: Account = { id: 'a', label: 'First', secret: 'one' };
    const secondAccount: Account = { id: 'b', label: 'Second', secret: 'two' };
    const firstSwitch = jest.fn(async () => undefined);
    const secondSwitch = jest.fn(async () => undefined);

    const firstFeature = renderHook(() => useQuickAccountsFeature({
      accounts: [firstAccount],
      onSwitch: firstSwitch,
    }));
    commitHook();
    const secondFeature = renderHook(() => useQuickAccountsFeature({
      accounts: [secondAccount],
      currentAccountId: secondAccount.id,
      onSwitch: secondSwitch,
    }));
    commitHook();

    expect(secondFeature).toBe(firstFeature);
    expect(secondFeature.getViewState().accounts).toEqual([
      { id: 'b', label: 'Second', subtitle: undefined, note: undefined },
    ]);
    await secondFeature.switchAccount(secondAccount.id);
    expect(firstSwitch).not.toHaveBeenCalled();
    expect(secondSwitch).toHaveBeenCalledWith(
      secondAccount,
      expect.objectContaining({ signal: expect.any(Object) }),
    );
  });

  it('does not expose callbacks from an abandoned render', async () => {
    const account: Account = { id: 'a', label: 'First', secret: 'one' };
    const committedSwitch = jest.fn(async () => undefined);
    const abandonedSwitch = jest.fn(async () => undefined);

    const feature = renderHook(() => useQuickAccountsFeature({
      accounts: [account],
      onSwitch: committedSwitch,
    }));
    commitHook();

    renderHook(() => useQuickAccountsFeature({
      accounts: [account],
      onSwitch: abandonedSwitch,
    }));

    await feature.switchAccount(account.id);

    expect(committedSwitch).toHaveBeenCalledTimes(1);
    expect(abandonedSwitch).not.toHaveBeenCalled();
  });
});
