import type { Variants } from "framer-motion";

/** Shared cubic-bezier for a snappy deceleration curve */
export const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

/** Container that staggers children on mount */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

/** Fade up from 16px below */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease },
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

/** Scale in from 95% */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease },
  },
};
