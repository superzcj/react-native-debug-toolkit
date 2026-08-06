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
