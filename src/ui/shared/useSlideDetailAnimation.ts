import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Shared slide-in/out animation for tab detail views.
 * Returns animated styles for the detail overlay and the list behind it.
 */
export function useSlideDetailAnimation<T>(
  selected: T | null,
): {
  detailTranslateX: Animated.AnimatedInterpolation<number>;
  listTranslateX: Animated.AnimatedInterpolation<number>;
  listOpacity: Animated.AnimatedInterpolation<number>;
} {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const listSlideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (selected) {
      listSlideAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 1, friction: 9, tension: 60, useNativeDriver: true }),
        Animated.spring(listSlideAnim, { toValue: 1, friction: 9, tension: 60, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(0);
      listSlideAnim.setValue(0);
    }
  }, [selected, slideAnim, listSlideAnim]);

  const detailTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });
  const listTranslateX = listSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -60],
  });
  const listOpacity = listSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return { detailTranslateX, listTranslateX, listOpacity };
}
