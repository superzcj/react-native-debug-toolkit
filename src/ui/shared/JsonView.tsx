import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  type TextStyle,
} from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Spacing, Radius } from '../theme/layout';

const MAX_DEPTH = 8;
const MAX_CHILDREN = 100;

export const JsonView: React.FC<{
  data: unknown;
  maxHeight?: number;
  /** Top-level object keys to emphasize (e.g. zustand changed fields). */
  highlightKeys?: readonly string[];
}> = React.memo(({
  data,
  maxHeight,
  highlightKeys,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const prevDataRef = useRef(data);
  if (prevDataRef.current !== data) {
    prevDataRef.current = data;
    setCollapsed(new Set());
  }

  const highlightSet = useMemo(
    () => (highlightKeys && highlightKeys.length > 0 ? new Set(highlightKeys) : null),
    [highlightKeys],
  );

  const toggle = useCallback((path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <ScrollView
      style={[s.scroll, maxHeight != null && { maxHeight }]}
      nestedScrollEnabled
      bounces={false}
      showsVerticalScrollIndicator
    >
      <View style={s.block}>
        <Node
          value={data}
          depth={0}
          isLast
          path=""
          collapsed={collapsed}
          toggle={toggle}
          highlightKeys={highlightSet}
        />
      </View>
    </ScrollView>
  );
});

const Node: React.FC<{
  value: unknown;
  depth: number;
  isLast: boolean;
  path: string;
  collapsed: Set<string>;
  toggle: (path: string) => void;
  highlightKeys: Set<string> | null;
}> = ({ value, depth, isLast, path, collapsed, toggle, highlightKeys }) => {
  const comma = isLast ? '' : ',';

  if (value === null) return <C color={Colors.codeNull}>{`null${comma}`}</C>;
  if (value === undefined) return <C color={Colors.codeNull}>{`undefined${comma}`}</C>;
  if (typeof value === 'boolean') return <C color={Colors.codeBoolean}>{`${String(value)}${comma}`}</C>;
  if (typeof value === 'number') return <C color={Colors.codeNumber}>{`${value}${comma}`}</C>;
  if (typeof value === 'string') {
    const display = value.length > 500 ? value.slice(0, 500) + '...' : value;
    return <C color={Colors.codeString} selectable>{`"${display}"${comma}`}</C>;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const isArray = Array.isArray(value);
  const open = isArray ? '[' : '{';
  const close = isArray ? ']' : '}';

  if (depth >= MAX_DEPTH) {
    return <C color={Colors.codeComment}>{`${open}...${close}${comma}`}</C>;
  }

  if (entries.length === 0) return <C color={Colors.codeComment}>{`${open}${close}${comma}`}</C>;

  const isCollapsed = collapsed.has(path);
  const count = entries.length;

  // Collapsed: show summary
  if (isCollapsed) {
    const summary = isArray
      ? `${open}..${count}..${close}${comma}`
      : `${open} ${count} keys ${close}${comma}`;
    return (
      <Pressable onPress={() => toggle(path)} style={s.collapsedRow}>
        <C color={Colors.codeComment}>{'▸ '}</C>
        <C color={Colors.codeComment}>{summary}</C>
      </Pressable>
    );
  }

  const limited = entries.slice(0, MAX_CHILDREN);

  return (
    <View style={depth > 0 ? s.indent : undefined}>
      <Pressable onPress={() => toggle(path)} style={s.toggleRow}>
        <C color={Colors.codeComment}>{'▾ '}</C>
        <C color={Colors.codeComment}>{open}</C>
        {!isArray && count > 3 && (
          <C color={Colors.codeComment}>{` // ${count} keys`}</C>
        )}
        {isArray && count > 3 && (
          <C color={Colors.codeComment}>{` // ${count} items`}</C>
        )}
      </Pressable>
      {limited.map(([key, val], i) => {
        const highlighted = depth === 0 && !isArray && highlightKeys?.has(key);
        return (
          <View key={key} style={[s.line, highlighted && s.highlightedLine]}>
            <Text style={s.row}>
              {!isArray && (
                <C
                  color={highlighted ? Colors.warning : Colors.codeKey}
                  weight={highlighted ? FontWeight.bold : undefined}
                >
                  {`  "${key}"`}
                </C>
              )}
              {!isArray && <C color={Colors.codeText}>{': '}</C>}
            </Text>
            <Node
              value={val}
              depth={depth + 1}
              isLast={i === limited.length - 1}
              path={`${path}/${key}`}
              collapsed={collapsed}
              toggle={toggle}
              highlightKeys={highlightKeys}
            />
          </View>
        );
      })}
      {entries.length > MAX_CHILDREN && (
        <C color={Colors.codeComment}>{`  ... ${entries.length - MAX_CHILDREN} more`}</C>
      )}
      <C color={Colors.codeComment}>{`${close}${comma}`}</C>
    </View>
  );
};

const C: React.FC<{
  color: string;
  children: string;
  selectable?: boolean;
  weight?: TextStyle['fontWeight'];
}> = ({
  color,
  children,
  selectable,
  weight,
}) => (
  <Text style={[s.node, { color }, weight != null && { fontWeight: weight }]} selectable={selectable}>
    {children}
  </Text>
);

const s = StyleSheet.create({
  scroll: {
    backgroundColor: Colors.codeBackground,
    borderRadius: Radius.LG,
    padding: Spacing.MD,
  },
  block: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.codeBorder,
  },
  node: {
    fontFamily: 'Courier',
    fontSize: FontSize.SM,
    lineHeight: 17,
    color: Colors.codeText,
  },
  indent: {
    paddingLeft: Spacing.LG,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: Radius.XS,
    paddingVertical: 1,
  },
  highlightedLine: {
    backgroundColor: Colors.warningDim,
    borderLeftWidth: 2,
    borderLeftColor: Colors.warning,
    marginLeft: -2,
    paddingLeft: 2,
  },
  row: {},
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  collapsedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
