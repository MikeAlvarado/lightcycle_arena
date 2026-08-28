// src/config/arena.ts
import type { Direction, LogicalVertex } from "../utils/latticeHelpers";
import { GRID_CONFIG } from "../utils/gridConfig";

/**
 * Where the two riders start.
 *
 * They used to share a column, nose to nose. Simulated over 40 rounds, 80% of
 * them ended in a head-on and the average round lasted one second flat: a rider
 * who didn't turn immediately was dead, which is no way to open a match. Six
 * cells apart takes head-on openings to zero and roughly doubles the round.
 */
export const SPAWN_COLUMN_OFFSET_IN_CELLS = 6;

const MIDDLE_COLUMN = Math.floor(GRID_CONFIG.columns / 2);

export const PLAYER_SPAWN: LogicalVertex = {
  columnIndexInCells: MIDDLE_COLUMN - SPAWN_COLUMN_OFFSET_IN_CELLS,
  rowIndexInCells: GRID_CONFIG.rows - 6,
};

export const RIVAL_SPAWN: LogicalVertex = {
  columnIndexInCells: MIDDLE_COLUMN + SPAWN_COLUMN_OFFSET_IN_CELLS,
  rowIndexInCells: 6,
};

export const PLAYER_START_DIRECTION: Direction = "up";
export const RIVAL_START_DIRECTION: Direction = "down";
