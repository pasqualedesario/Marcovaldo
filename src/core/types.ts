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

/** UI params: growth/scale 0–100; tracking 0–TRACKING_MAX (mid = 0em). */
export type BotanicalParams = {
  growth: number;
  scale: number;
  /** Letter-spacing for the hero specimen (see TRACKING_MAX / trackingEm). */
  tracking: number;
};

export type CaretMetric = { x: number; y: number; h: number };

export type FitResult = {
  lamina: Contours;
  fontSize: number;
  caret: CaretMetric;
  /** Stage X for each character boundary 0…text.length (selection + caret). */
  caretStops: number[];
  /** Full caret geometry (multi-line Y/H); parallel to caretStops. */
  caretMetrics: CaretMetric[];
  pointCount: number;
};
