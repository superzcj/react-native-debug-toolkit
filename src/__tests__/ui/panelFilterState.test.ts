import {
  INITIAL_PANEL_FILTER_STATE,
  panelFilterReducer,
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
