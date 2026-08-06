import React from 'react';
import type { ReactElement } from 'react';
import { FeatureIntroCard } from '../../ui/panel/FeatureIntroCard';

type ElementProps = Record<string, any>;

function propsOf(node: React.ReactNode): ElementProps {
  return (node as ReactElement<ElementProps>).props;
}

function findElement(
  node: React.ReactNode,
  predicate: (element: ReactElement<ElementProps>) => boolean,
): ReactElement<ElementProps> | undefined {
  if (!React.isValidElement(node)) return undefined;
  const element = node as ReactElement<ElementProps>;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return undefined;
}

const summary = {
  capabilityText: 'Console logs',
  count: 3,
  supportsBadFilter: true,
};

function renderCard(overrides: Record<string, unknown> = {}) {
  return FeatureIntroCard({
    title: 'Logs',
    summary,
    filterBad: false,
    onFilterBad: jest.fn(),
    searchQuery: '',
    onSearchChange: jest.fn(),
    showSearch: true,
    searchExpanded: false,
    onSearchExpandedChange: jest.fn(),
    ...overrides,
  } as Parameters<typeof FeatureIntroCard>[0] & {
    searchExpanded: boolean;
    onSearchExpandedChange: (expanded: boolean) => void;
  });
}

describe('FeatureIntroCard search', () => {
  it('renders a collapsed search action without a second header row', () => {
    const onSearchExpandedChange = jest.fn();
    const tree = renderCard({ onSearchExpandedChange });
    const open = findElement(tree, (element) => (
      element.props.accessibilityLabel === 'Open search'
    ));
    const input = findElement(tree, (element) => element.props.placeholder === 'Search');

    expect(open).toBeDefined();
    expect(input).toBeUndefined();
    expect(React.Children.toArray(propsOf(tree).children)).toHaveLength(1);
    open?.props.onPress();
    expect(onSearchExpandedChange).toHaveBeenCalledWith(true);
  });

  it('expands search in place and collapses without clearing the query', () => {
    const onSearchChange = jest.fn();
    const onSearchExpandedChange = jest.fn();
    const tree = renderCard({
      searchExpanded: true,
      searchQuery: 'timeout',
      onSearchChange,
      onSearchExpandedChange,
    });
    const input = findElement(tree, (element) => element.props.placeholder === 'Search');
    const done = findElement(tree, (element) => (
      element.props.accessibilityLabel === 'Close search'
    ));

    expect(input?.props.value).toBe('timeout');
    expect(input?.props.autoFocus).toBe(true);
    input?.props.onChangeText('fatal');
    expect(onSearchChange).toHaveBeenCalledWith('fatal');
    done?.props.onPress();
    expect(onSearchExpandedChange).toHaveBeenCalledWith(false);
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(React.Children.toArray(propsOf(tree).children)).toHaveLength(1);
  });

  it('marks a collapsed non-empty query as active', () => {
    const tree = renderCard({ searchQuery: 'timeout' });
    const open = findElement(tree, (element) => (
      element.props.accessibilityLabel === 'Open search'
    ));

    expect(open?.props.accessibilityState).toEqual({
      expanded: false,
      selected: true,
    });
  });

  it('omits the search action when data is not searchable', () => {
    const tree = renderCard({ showSearch: false });

    expect(findElement(tree, (element) => (
      element.props.accessibilityLabel === 'Open search'
    ))).toBeUndefined();
  });

  it('uses the same non-zero minimum height for collapsed and expanded regions', () => {
    const collapsed = renderCard();
    const expanded = renderCard({ searchExpanded: true });
    const [collapsedRegion] = React.Children.toArray(propsOf(collapsed).children);
    const [expandedRegion] = React.Children.toArray(propsOf(expanded).children);
    const collapsedHeight = propsOf(collapsedRegion).style.minHeight;
    const expandedHeight = propsOf(expandedRegion).style.minHeight;

    expect(collapsedHeight).toBeGreaterThan(0);
    expect(expandedHeight).toBe(collapsedHeight);
  });
});
