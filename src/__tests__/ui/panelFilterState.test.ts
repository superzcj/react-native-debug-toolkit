import {
  INITIAL_PANEL_FILTER_STATE,
  changeTabWithFilterReset,
  clearAllWithFilterReset,
  panelFilterReducer,
  type PanelFilterAction,
  type PanelFilterState,
} from '../../ui/panel/panelFilterState';

describe('panelFilterReducer', () => {
  it('updates query, Bad filter, and expansion independently', () => {
    let state = INITIAL_PANEL_FILTER_STATE;

    state = panelFilterReducer(state, { type: 'set-query', query: 'timeout' });
    state = panelFilterReducer(state, { type: 'set-bad', bad: true });
    state = panelFilterReducer(state, {
      type: 'set-search-expanded',
      expanded: true,
    });

    expect(state).toEqual({
      searchQuery: 'timeout',
      filterBad: true,
      searchExpanded: true,
    });
  });

  it('resets all filter and search presentation state together', () => {
    const active = {
      searchQuery: 'timeout',
      filterBad: true,
      searchExpanded: true,
    };

    expect(panelFilterReducer(active, { type: 'reset' })).toEqual(
      INITIAL_PANEL_FILTER_STATE,
    );
  });
});

/** FloatPanelView tab-switch / Clear All call sites — keep searchExpanded in the reset. */
describe('FloatPanelView filter reset wiring', () => {
  const active: PanelFilterState = {
    searchQuery: 'timeout',
    filterBad: true,
    searchExpanded: true,
  };

  function dispatchHarness(initial: PanelFilterState) {
    let state = initial;
    const dispatch = (action: PanelFilterAction) => {
      state = panelFilterReducer(state, action);
    };
    return {
      get state() {
        return state;
      },
      dispatch,
    };
  }

  it('tab switch resets query, Bad filter, and searchExpanded together', () => {
    const harness = dispatchHarness(active);
    const setActiveTab = jest.fn();

    changeTabWithFilterReset(harness.dispatch, setActiveTab, 2);

    expect(harness.state).toEqual(INITIAL_PANEL_FILTER_STATE);
    expect(setActiveTab).toHaveBeenCalledWith(2);
  });

  it('Clear All resets query, Bad filter, and searchExpanded together', () => {
    const harness = dispatchHarness(active);
    const onClearAll = jest.fn();

    clearAllWithFilterReset(harness.dispatch, onClearAll);

    expect(harness.state).toEqual(INITIAL_PANEL_FILTER_STATE);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
