import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { getTabConfig } from '../../constants/animationConfig';
import { useReduceMotion } from '../../hooks/useReduceMotion';

export function useStaggerAnimation() {
  const reducedMotion = useReduceMotion();
  const tabConfig = getTabConfig(reducedMotion);
  const itemAnims = useRef<Map<number, Animated.Value>>(new Map());
  const activeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const getAnim = useCallback((index: number): Animated.Value => {
    let anim = itemAnims.current.get(index);
    if (!anim) {
      anim = new Animated.Value(0);
      itemAnims.current.set(index, anim);
    }
    return anim;
  }, []);

  const staggerIn = useCallback((visibleIndices: number[]) => {
    if (activeAnimationRef.current) {
      activeAnimationRef.current.stop();
    }

    const capped = visibleIndices.slice(0, tabConfig.maxStaggerItems);

    if (reducedMotion || !tabConfig.useStagger) {
      capped.forEach((idx) => {
        const anim = itemAnims.current.get(idx);
        if (anim) anim.setValue(1);
      });
      return;
    }

    capped.forEach((idx) => {
      const anim = itemAnims.current.get(idx);
      if (anim) anim.setValue(0);
    });

    const animations = capped.map((idx, i) => {
      const anim = itemAnims.current.get(idx);
      if (!anim) return null;
      return Animated.timing(anim, {
        toValue: 1,
        duration: tabConfig.fadeInDuration,
        delay: i * tabConfig.staggerDelay,
        useNativeDriver: true,
      });
    }).filter(Boolean) as Animated.CompositeAnimation[];

    const composite = Animated.parallel(animations);
    activeAnimationRef.current = composite;
    composite.start(({ finished }) => {
      if (finished) activeAnimationRef.current = null;
    });
  }, [tabConfig, reducedMotion]);

  const resetAll = useCallback(() => {
    if (activeAnimationRef.current) {
      activeAnimationRef.current.stop();
      activeAnimationRef.current = null;
    }
    itemAnims.current.forEach((anim) => anim.setValue(0));
  }, []);

  return { getAnim, staggerIn, resetAll, staggerDelay: tabConfig.staggerDelay };
}
