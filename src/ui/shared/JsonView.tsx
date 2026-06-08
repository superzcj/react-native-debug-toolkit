import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/layout';

const MAX_DEPTH = 8;
const MAX_CHILDREN = 100;

export const JsonView: React.FC<{ data: unknown; maxHeight?: number }> = React.memo(({
  data,
  maxHeight,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const prevDataRef = useRef(data);
  if (prevDataRef.current !== data) {
    prevDataRef.current = data;
    setCollapsed(new Set());
  }

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
        <Node value={data} depth={0} isLast path="" collapsed={collapsed} toggle={toggle} />
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
}> = ({ value, depth, isLast, path, collapsed, toggle }) => {
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
      {limited.map(([key, val], i) => (
        <View key={key} style={s.line}>
          <Text style={s.row}>
            {!isArray && <C color={Colors.codeKey}>{`  "${key}"`}</C>}
            {!isArray && <C color={Colors.codeText}>{': '}</C>}
          </Text>
          <Node
            value={val}
            depth={depth + 1}
            isLast={i === limited.length - 1}
            path={`${path}/${key}`}
            collapsed={collapsed}
            toggle={toggle}
          />
        </View>
      ))}
      {entries.length > MAX_CHILDREN && (
        <C color={Colors.codeComment}>{`  ... ${entries.length - MAX_CHILDREN} more`}</C>
      )}
      <C color={Colors.codeComment}>{`${close}${comma}`}</C>
    </View>
  );
};

const C: React.FC<{ color: string; children: string; selectable?: boolean }> = ({
  color,
  children,
  selectable,
}) => (
  <Text style={[s.node, { color }]} selectable={selectable}>
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
