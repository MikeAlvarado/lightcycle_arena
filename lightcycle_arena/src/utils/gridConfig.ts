// src/utils/gridConfig.ts

/**
 * Grid configuration (in logical cells).
 * Vertices live on a 2x lattice: (2*rows+1) x (2*columns+1).
 */
export interface GridConfig {
  columns: number;
  rows: number;
}

export const GRID_CONFIG: GridConfig = {
  columns: 40,
  rows: 30,
};
