// src/types/player.ts
import type { Direction, LatticeIndex } from "../utils/latticeHelpers";

/**
 * Who is on the bike.
 *
 * The id is the seat — player one, player two — and never changes. The name and
 * colour do: each level fields a different rider in seat two.
 */
export interface PlayerIdentity {
  readonly id: number;
  name: string;
  color: string;
}

/**
 * Mutable runtime state of a player on the lattice.
 */
export interface PlayerState {
  headLatticeIndex: LatticeIndex; // current head position (even, even)
  previousHeadLatticeIndex: LatticeIndex; // vertex left behind this tick (render interpolation)
  direction: Direction;           // applied direction
  pendingDirection: Direction;    // buffered input
  isAlive: boolean;               // crash flag
  ticksSurvived: number;          // simple score metric
}

/**
 * Full Player object used by the game.
 * Identity + mutable state.
 */
export interface Player extends PlayerIdentity, PlayerState {}

/**
 * Helpers for input and reset hooks (narrow contracts).
 */
export type PlayerForInput = Pick<Player, "direction" | "pendingDirection">;
export type PlayerForReset = Pick<
  Player,
  | "headLatticeIndex"
  | "previousHeadLatticeIndex"
  | "direction"
  | "pendingDirection"
  | "isAlive"
  | "ticksSurvived"
>;
