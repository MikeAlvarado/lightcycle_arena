// src/config/arena.ts
import type { Direction, LogicalVertex } from "../utils/latticeHelpers";
import { GRID_CONFIG } from "../utils/gridConfig";

/**
 * Where the two riders start: nose to nose on the same column, the way the
 * films open a lightcycle duel.
 *
 * This only works because the bots flinch. Riding onto a square the other rider
 * could also take costs them, and that check runs every tick regardless of how
 * slowly a given difficulty thinks — so the opening is a game of chicken the
 * bot swerves out of, rather than a coin toss neither of you survives. See the
 * opening table in the balance simulation.
 */
export const SPAWN_COLUMN_OFFSET_IN_CELLS = 0;

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
