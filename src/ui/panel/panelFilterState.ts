export interface PanelFilterState {
  searchQuery: string;
  filterBad: boolean;
  searchExpanded: boolean;
}

export type PanelFilterAction =
  | { type: 'set-query'; query: string }
  | { type: 'set-bad'; bad: boolean }
  | { type: 'set-search-expanded'; expanded: boolean }
  | { type: 'reset' };

export const INITIAL_PANEL_FILTER_STATE: PanelFilterState = {
  searchQuery: '',
  filterBad: false,
  searchExpanded: false,
};

export function panelFilterReducer(
  state: PanelFilterState,
  action: PanelFilterAction,
): PanelFilterState {
  switch (action.type) {
    case 'set-query':
      return { ...state, searchQuery: action.query };
    case 'set-bad':
      return { ...state, filterBad: action.bad };
    case 'set-search-expanded':
      return { ...state, searchExpanded: action.expanded };
    case 'reset':
      return INITIAL_PANEL_FILTER_STATE;
  }
}

type PanelFilterDispatch = (action: PanelFilterAction) => void;

/** FloatPanelView tab-switch call site: reset filters (incl. searchExpanded) then change tab. */
export function changeTabWithFilterReset(
  dispatch: PanelFilterDispatch,
  setActiveTab: (index: number) => void,
  index: number,
): void {
  dispatch({ type: 'reset' });
  setActiveTab(index);
}

/** FloatPanelView Clear All call site: reset filters (incl. searchExpanded) then clear features. */
export function clearAllWithFilterReset(
  dispatch: PanelFilterDispatch,
  onClearAll: () => void,
): void {
  dispatch({ type: 'reset' });
  onClearAll();
}
