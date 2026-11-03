export type Pt = Readonly<{ x: number; y: number }>;
export type Contour = Pt[];
export type Contours = Contour[];

export type PathCmd =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };

export type PathData = { readonly commands: readonly PathCmd[] };

export type Bounds = { x1: number; y1: number; x2: number; y2: number };

/** UI params (0–100). Botanical growth + typographic scale/tracking. */
export type BotanicalParams = {
  growth: number;
  scale: number;
  /** Letter-spacing for the hero specimen (0–100 → tight…open). */
  tracking: number;
};

export type FitResult = {
  lamina: Contours;
  fontSize: number;
  caret: { x: number; y: number; h: number };
  /** Stage X for each character boundary 0…text.length (selection + caret). */
  caretStops: number[];
  pointCount: number;
};
