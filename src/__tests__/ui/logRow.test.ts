import React from 'react';
import type { ReactElement } from 'react';
import { LogRow, LogRowMetaText } from '../../ui/shared/LogRow';

type ElementProps = Record<string, any>;

function propsOf(node: React.ReactNode): ElementProps {
  return (node as ReactElement<ElementProps>).props;
}

describe('LogRow', () => {
  it('limits primary content to three lines by default', () => {
    const tree = LogRow({ content: 'line one line two line three line four' });
    const [content] = React.Children.toArray(propsOf(tree).children);

    expect(propsOf(content).numberOfLines).toBe(3);
  });

  it('accepts an explicit primary content line limit', () => {
    const tree = LogRow({ content: 'message', maxContentLines: 1 });
    const [content] = React.Children.toArray(propsOf(tree).children);

    expect(propsOf(content).numberOfLines).toBe(1);
  });

  it('keeps flexible and trailing metadata in separate wrapping groups', () => {
    const metadata = React.createElement('Meta', { id: 'source' });
    const trailing = React.createElement('Trailing', { id: 'time' });
    const tree = LogRow({ content: 'message', metadata, trailingMetadata: trailing });
    const [, footer] = React.Children.toArray(propsOf(tree).children);
    const [metadataGroup, trailingGroup] = React.Children.toArray(propsOf(footer).children);

    expect(propsOf(footer).style).toEqual(expect.objectContaining({
      flexDirection: 'row',
      flexWrap: 'wrap',
    }));
    expect(propsOf(metadataGroup).style).toEqual(expect.objectContaining({
      flexGrow: 1,
      flexShrink: 1,
    }));
    expect(propsOf(trailingGroup).style).toEqual(expect.objectContaining({
      flexShrink: 0,
      marginLeft: 'auto',
    }));
  });

  it('omits the footer when both metadata slots are absent', () => {
    const tree = LogRow({ content: 'message' });

    expect(React.Children.toArray(propsOf(tree).children)).toHaveLength(1);
  });
});

describe('LogRowMetaText', () => {
  it('shrinks and truncates long footer text to one line', () => {
    const tree = LogRowMetaText({ children: 'a very long native source' });

    expect(propsOf(tree).numberOfLines).toBe(1);
    expect(propsOf(tree).ellipsizeMode).toBe('tail');
    expect(propsOf(tree).style).toEqual(expect.arrayContaining([
      expect.objectContaining({ flexGrow: 1, flexShrink: 1, minWidth: 72 }),
    ]));
  });
});
