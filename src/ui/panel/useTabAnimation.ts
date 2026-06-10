import { useCallback, useRef } from 'react';
import { Animated, PanResponder, Easing } from 'react-native';
import { getTabConfig } from '../../constants/animationConfig';
import { useReduceMotion } from '../../hooks/useReduceMotion';

interface UseTabAnimationOptions {
  activeTab: number;
  tabCount: number;
  onTabChange: (index: number) => void;
}

export function useTabAnimation({ activeTab, tabCount, onTabChange }: UseTabAnimationOptions) {
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const isSwitchingTab = useRef(false);
  const activeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const reducedMotion = useReduceMotion();
  const tabConfig = getTabConfig(reducedMotion);

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

  const cancelActiveAnimation = useCallback(() => {
    if (activeAnimationRef.current) {
      activeAnimationRef.current.stop();
      activeAnimationRef.current = null;
    }
  }, []);

  const switchTab = useCallback(
    (index: number) => {
      if (isSwitchingTab.current || index === activeTabRef.current) return;
      isSwitchingTab.current = true;
      cancelActiveAnimation();

      const direction = index > activeTabRef.current ? 1 : -1;

      const fadeOut = Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: tabConfig.fadeOutDuration,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateX, {
          toValue: -direction * 40,
          duration: tabConfig.fadeOutDuration,
          useNativeDriver: true,
        }),
      ]);

      const anim = fadeOut;
      activeAnimationRef.current = anim;

      anim.start(({ finished }) => {
        if (!finished) {
          isSwitchingTab.current = false;
          return;
        }
        onTabChange(index);
        contentTranslateX.setValue(direction * 40);

        const fadeIn = Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: tabConfig.fadeInDuration,
            useNativeDriver: true,
          }),
          Animated.timing(contentTranslateX, {
            toValue: 0,
            duration: tabConfig.slideDuration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);

        activeAnimationRef.current = fadeIn;
        fadeIn.start(({ finished: done }) => {
          if (done) activeAnimationRef.current = null;
          isSwitchingTab.current = false;
        });
      });
    },
    [contentOpacity, contentTranslateX, onTabChange, tabConfig, cancelActiveAnimation],
  );

  switchTabRef.current = switchTab;

  return {
    contentOpacity,
    contentTranslateX,
    panHandlers: swipeResponder.panHandlers,
    switchTab,
  };
}
