import { useCallback, useRef } from 'react';
import { Animated, PanResponder, Easing } from 'react-native';

interface UseTabAnimationOptions {
  activeTab: number;
  tabCount: number;
  onTabChange: (index: number) => void;
}

export function useTabAnimation({ activeTab, tabCount, onTabChange }: UseTabAnimationOptions) {
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(1)).current;
  const isSwitchingTab = useRef(false);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const tabCountRef = useRef(tabCount);
  tabCountRef.current = tabCount;
  const switchTabRef = useRef<(index: number) => void>(() => {});

  const swipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (isSwitchingTab.current) return false;
        return Math.abs(gs.dx) > 25 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2.5;
      },
      onPanResponderRelease: (_, gs) => {
        const tab = activeTabRef.current;
        if (gs.dx < -40 && tab < tabCountRef.current - 1) switchTabRef.current(tab + 1);
        else if (gs.dx > 40 && tab > 0) switchTabRef.current(tab - 1);
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  const switchTab = useCallback(
    (index: number) => {
      if (isSwitchingTab.current || index === activeTabRef.current) return;
      isSwitchingTab.current = true;
      const direction = index > activeTabRef.current ? 1 : -1;

      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 0, duration: 80, useNativeDriver: true }),
        Animated.timing(contentTranslateX, {
          toValue: -direction * 40,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(contentScale, {
          toValue: 0.97,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onTabChange(index);
        contentTranslateX.setValue(direction * 40);
        Animated.parallel([
          Animated.timing(contentOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(contentTranslateX, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(contentScale, {
            toValue: 1,
            friction: 8,
            tension: 70,
            useNativeDriver: true,
          }),
        ]).start(() => {
          isSwitchingTab.current = false;
        });
      });
    },
    [contentOpacity, contentScale, contentTranslateX, onTabChange],
  );

  switchTabRef.current = switchTab;

  return {
    contentOpacity,
    contentScale,
    contentTranslateX,
    panHandlers: swipeResponder.panHandlers,
    switchTab,
  };
}
