import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { getLogItemConfig } from '../../constants/animationConfig';
import { useReduceMotion } from '../../hooks/useReduceMotion';

export function useSlideDetailAnimation<T>(
  selected: T | null,
): {
  detailTranslateX: Animated.AnimatedInterpolation<number>;
  listTranslateX: Animated.AnimatedInterpolation<number>;
  listOpacity: Animated.AnimatedInterpolation<number>;
} {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const listSlideAnim = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReduceMotion();
  const logItemConfig = getLogItemConfig(reducedMotion);

  useEffect(() => {
    if (selected) {
      listSlideAnim.setValue(0);
      const slideToDetail = logItemConfig.useSpring
        ? Animated.spring(slideAnim, {
            toValue: 1,
            friction: logItemConfig.expandFriction,
            tension: logItemConfig.expandTension,
            useNativeDriver: true,
          })
        : Animated.timing(slideAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          });

      const slideList = logItemConfig.useSpring
        ? Animated.spring(listSlideAnim, {
            toValue: 1,
            friction: logItemConfig.expandFriction,
            tension: logItemConfig.expandTension,
            useNativeDriver: true,
          })
        : Animated.timing(listSlideAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          });

      Animated.parallel([slideToDetail, slideList]).start();
    } else {
      slideAnim.setValue(0);
      listSlideAnim.setValue(0);
    }
  }, [selected, slideAnim, listSlideAnim, logItemConfig]);

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
