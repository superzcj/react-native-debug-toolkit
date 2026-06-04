import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/layout';
import { safeStringify } from '../../utils/safeStringify';

const MAX_DEPTH = 3;
const MAX_CHILDREN = 50;

export const JsonView: React.FC<{ data: unknown; maxHeight?: number }> = React.memo(({
  data,
  maxHeight,
}) => {
  return (
    <ScrollView
      style={[s.scroll, maxHeight != null && { maxHeight }]}
      nestedScrollEnabled
      bounces={false}
      showsVerticalScrollIndicator
    >
      <View style={s.block}>
        <Node value={data} depth={0} isLast />
      </View>
    </ScrollView>
  );
});

const Node: React.FC<{
  value: unknown;
  depth: number;
  isLast: boolean;
}> = ({ value, depth, isLast }) => {
  const comma = isLast ? '' : ',';

  if (value === null) return <C color={Colors.codeNull}>{`null${comma}`}</C>;
  if (value === undefined) return <C color={Colors.codeNull}>{`undefined${comma}`}</C>;
  if (typeof value === 'boolean') return <C color={Colors.codeBoolean}>{`${String(value)}${comma}`}</C>;
  if (typeof value === 'number') return <C color={Colors.codeNumber}>{`${value}${comma}`}</C>;
  if (typeof value === 'string') {
    const display = value.length > 500 ? value.slice(0, 500) + '...' : value;
    return <C color={Colors.codeString} selectable>{`"${display}"${comma}`}</C>;
  }

  if (depth >= MAX_DEPTH) {
    const collapsed = truncate(safeStringify(value), 200);
    return <C color={Colors.codeComment}>{`${collapsed}${comma}`}</C>;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const isArray = Array.isArray(value);
  const open = isArray ? '[' : '{';
  const close = isArray ? ']' : '}';

  if (entries.length === 0) return <C color={Colors.codeComment}>{`${open}${close}${comma}`}</C>;

  const limited = entries.slice(0, MAX_CHILDREN);

  return (
    <View style={depth > 0 ? s.indent : undefined}>
      <C color={Colors.codeComment}>{open}</C>
      {limited.map(([key, val], i) => (
        <View key={key} style={s.line}>
          <Text style={s.row}>
            {!isArray && <Text style={s.key}>"{key}"</Text>}
            {!isArray && <Text style={s.colon}>{': '}</Text>}
          </Text>
          <Node
            value={val}
            depth={depth + 1}
            isLast={i === limited.length - 1}
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

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

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
  key: {
    fontFamily: 'Courier',
    fontSize: FontSize.SM,
    color: Colors.codeKey,
  },
  colon: {
    fontFamily: 'Courier',
    fontSize: FontSize.SM,
    color: Colors.codeText,
  },
});
