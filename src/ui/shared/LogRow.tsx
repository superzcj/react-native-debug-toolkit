import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextProps, TextStyle } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, Spacing } from '../theme/layout';

export interface LogRowProps {
  content: React.ReactNode;
  maxContentLines?: number;
  contentStyle?: StyleProp<TextStyle>;
  metadata?: React.ReactNode;
  trailingMetadata?: React.ReactNode;
}

export function LogRow({
  content,
  maxContentLines = 3,
  contentStyle,
  metadata,
  trailingMetadata,
}: LogRowProps) {
  const hasMetadata = metadata !== null && metadata !== undefined;
  const hasTrailingMetadata = trailingMetadata !== null && trailingMetadata !== undefined;

  return (
    <View style={styles.row}>
      <Text style={[styles.content, contentStyle]} numberOfLines={maxContentLines}>
        {content}
      </Text>
      {(hasMetadata || hasTrailingMetadata) && (
        <View style={styles.footer}>
          {hasMetadata && <View style={styles.metadata}>{metadata}</View>}
          {hasTrailingMetadata && (
            <View style={styles.trailingMetadata}>{trailingMetadata}</View>
          )}
        </View>
      )}
    </View>
  );
}

export interface LogRowMetaTextProps extends Omit<TextProps, 'numberOfLines'> {
  children: React.ReactNode;
}

export function LogRowMetaText({
  children,
  style,
  ellipsizeMode = 'tail',
  ...rest
}: LogRowMetaTextProps) {
  return (
    <Text
      {...rest}
      style={[styles.metadataText, style]}
      numberOfLines={1}
      ellipsizeMode={ellipsizeMode}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: Spacing.MD,
    gap: Spacing.XS,
  },
  content: {
    color: Colors.text,
    fontSize: FontSize.MD,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.SM,
    rowGap: Spacing.XS,
    minWidth: 0,
  },
  metadata: {
    flexBasis: 96,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 96,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.XS,
    rowGap: Spacing.XXS,
  },
  trailingMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  metadataText: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 72,
    color: Colors.textSecondary,
    fontSize: FontSize.XS,
  },
});
