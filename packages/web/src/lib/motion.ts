import type { Variants } from "framer-motion";

/** Shared cubic-bezier for a snappy deceleration curve */
export const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

/** Spring presets */
export const spring = { type: "spring" as const, stiffness: 300, damping: 24 };
export const springSnap = { type: "spring" as const, stiffness: 500, damping: 30 };
export const springGentle = { type: "spring" as const, stiffness: 180, damping: 20 };

/** Container that staggers children on mount */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

/** Fade up from 16px below (spring on y, tween on opacity) */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      y: spring,
      opacity: { duration: 0.4, ease },
    },
  },
};

/** Fade in without movement */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.4, ease },
  },
};

/** Scale in from 95% (spring on scale, tween on opacity) */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      scale: spring,
      opacity: { duration: 0.4, ease },
    },
  },
};

/** Slide in from the left (spring on x, tween on opacity) */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -24 },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      x: spring,
      opacity: { duration: 0.4, ease },
    },
  },
};

/** Rotate + scale entrance for cards (spring physics) */
export const flipIn: Variants = {
  hidden: { opacity: 0, rotateY: -15, scale: 0.92 },
  show: {
    opacity: 1,
    rotateY: 0,
    scale: 1,
    transition: {
      rotateY: spring,
      scale: spring,
      opacity: { duration: 0.5, ease },
    },
  },
};

/** Blur + fade entrance for hero text */
export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(12px)", y: 20 },
  show: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: {
      y: springGentle,
      opacity: { duration: 0.6, ease },
      filter: { duration: 0.6, ease },
    },
  },
};

/** Stagger with wider spacing */
export const staggerWide: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
