import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Colors } from '../theme/colors';

export interface TabItem {
  id: string;
  label: string;
}

interface FeatureTabBarProps {
  tabs: TabItem[];
  activeIndex: number;
  onSelectTab: (index: number) => void;
}

export function FeatureTabBar({ tabs, activeIndex, onSelectTab }: FeatureTabBarProps) {
  const [underlineWidth, setUnderlineWidth] = useState(0);
  const underlineTranslateX = useRef(new Animated.Value(0)).current;
  const tabScrollViewRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Array<{ x: number; width: number }>>([]);
  const tabScrollOffset = useRef(0);
  const tabViewportWidth = useRef(0);
  const tabContentWidth = useRef(0);
  const underlineInit = useRef(false);
  const isSwitching = useRef(false);

  const maxTabScroll = useCallback(
    () => Math.max(0, tabContentWidth.current - tabViewportWidth.current),
    [],
  );
  const clampScroll = useCallback(
    (offset: number) => Math.min(Math.max(0, offset), maxTabScroll()),
    [maxTabScroll],
  );
  const getTabScrollTarget = useCallback(
    (index: number) => {
      const layout = tabLayouts.current[index];
      return layout ? clampScroll(layout.x - 60) : clampScroll(tabScrollOffset.current);
    },
    [clampScroll],
  );

  const animateUnderline = useCallback(
    (index: number, scrollOffset?: number) => {
      const layout = tabLayouts.current[index];
      if (!layout) return;
      const offsetX = clampScroll(scrollOffset ?? tabScrollOffset.current);
      setUnderlineWidth(layout.width);
      Animated.spring(underlineTranslateX, {
        toValue: layout.x - offsetX,
        friction: 7,
        tension: 50,
        useNativeDriver: true,
      }).start();
    },
    [clampScroll, underlineTranslateX],
  );

  const syncUnderlineToActiveTab = useCallback(() => {
    const layout = tabLayouts.current[activeIndex];
    if (!layout) return;
    const clamped = clampScroll(tabScrollOffset.current);
    if (clamped !== tabScrollOffset.current) tabScrollOffset.current = clamped;
    underlineTranslateX.setValue(layout.x - clamped);
    setUnderlineWidth(layout.width);
  }, [activeIndex, clampScroll, underlineTranslateX]);

  const tryInit = useCallback(() => {
    if (underlineInit.current || tabViewportWidth.current <= 0 || tabContentWidth.current <= 0)
      return;
    const layout = tabLayouts.current[activeIndex];
    if (!layout) return;
    const target = getTabScrollTarget(activeIndex);
    tabScrollOffset.current = target;
    tabScrollViewRef.current?.scrollTo({ x: target, animated: false });
    underlineTranslateX.setValue(layout.x - target);
    setUnderlineWidth(layout.width);
    underlineInit.current = true;
  }, [activeIndex, getTabScrollTarget, underlineTranslateX]);

  const handleSelectTab = useCallback(
    (index: number) => {
      if (isSwitching.current || index === activeIndex) return;
      isSwitching.current = true;

      const layout = tabLayouts.current[index];
      if (layout) {
        const target = getTabScrollTarget(index);
        tabScrollOffset.current = target;
        tabScrollViewRef.current?.scrollTo({ x: target, animated: true });
        animateUnderline(index, target);
      }

      onSelectTab(index);
      setTimeout(() => {
        isSwitching.current = false;
      }, 350);
    },
    [activeIndex, animateUnderline, getTabScrollTarget, onSelectTab],
  );

  // React to external activeIndex changes (e.g. swipe-to-switch)
  useEffect(() => {
    if (!underlineInit.current) return;
    const layout = tabLayouts.current[activeIndex];
    if (!layout) return;
    const target = getTabScrollTarget(activeIndex);
    tabScrollOffset.current = target;
    tabScrollViewRef.current?.scrollTo({ x: target, animated: true });
    animateUnderline(activeIndex, target);
  }, [activeIndex, animateUnderline, getTabScrollTarget]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={tabScrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onLayout={(e) => {
          tabViewportWidth.current = e.nativeEvent.layout.width;
          tryInit();
        }}
        onContentSizeChange={(width) => {
          tabContentWidth.current = width;
          tryInit();
        }}
        onScroll={(e) => {
          tabScrollOffset.current = clampScroll(e.nativeEvent.contentOffset.x);
          if (!isSwitching.current) syncUnderlineToActiveTab();
        }}
        scrollEventThrottle={16}
      >
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => handleSelectTab(index)}
            activeOpacity={0.7}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              tabLayouts.current[index] = { x, width };
              if (index === activeIndex) tryInit();
            }}
          >
            <Text
              style={[styles.tabText, activeIndex === index && styles.activeTabText]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Animated.View
        style={[
          styles.underline,
          { width: underlineWidth, transform: [{ translateX: underlineTranslateX }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  scrollContent: {
    paddingHorizontal: 20,
    flexDirection: 'row',
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textLight,
  },
  activeTabText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: Colors.primary,
  },
});
