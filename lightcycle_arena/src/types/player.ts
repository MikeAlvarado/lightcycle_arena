// src/types/player.ts
import type { Direction, LatticeIndex } from "../utils/latticeHelpers";

/**
 * Immutable info: identity and visuals.
 */
export interface PlayerIdentity {
  readonly id: number;
  readonly name: string;
  readonly color: string;
}

/**
 * Mutable runtime state of a player on the lattice.
 */
export interface PlayerState {
  headLatticeIndex: LatticeIndex; // current head position (even, even)
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
export type PlayerForInput = Pick<Player, "pendingDirection">;
export type PlayerForReset = Pick<
  Player,
  "headLatticeIndex" | "direction" | "pendingDirection" | "isAlive" | "ticksSurvived"
>;
