export interface Quality {
  pixelRatioCap: number;
  maxPoints: number;
  maxRings: number;
  hexRes: number;
}

export function qualityFor(width: number, coarsePointer: boolean): Quality {
  return coarsePointer || width < 700
    ? { pixelRatioCap: 1.5, maxPoints: 80, maxRings: 6, hexRes: 2 }
    : { pixelRatioCap: 2, maxPoints: 250, maxRings: 24, hexRes: 3 };
}
