// src/game/movement.ts
import type { GridConfig } from "../utils/gridConfig";
import type { Direction, LatticeIndex, LatticeMatrix } from "../utils/latticeHelpers";
import {
  isInsideLattice,
  isOccupied,
  occupy,
  setOccupancy,
  stepOnLattice,
} from "../utils/latticeHelpers";

/** Why a rider went down, used for the round-end message. */
export type CrashCause = "arena" | "ownTrail" | "opponentTrail" | "headOn";

export interface MovingPlayer {
  headLatticeIndex: LatticeIndex;
  direction: Direction;
  isAlive: boolean;
}

/**
 * How fast the wall drains and refills, per tick.
 *
 * Two and a half seconds of cutting, seven to earn it back: long enough to get
 * out of somewhere, short enough that it can't be left off.
 */
export const WALL_DRAIN_PER_TICK = 1 / 25;
export const WALL_RECHARGE_PER_TICK = 1 / 70;

export interface ResolvedMove {
  traversedEdge: LatticeIndex;
  destination: LatticeIndex;
  crashed: boolean;
  cause: CrashCause | null;
}

function isSameCell(first: LatticeIndex, second: LatticeIndex): boolean {
  return (
    first.rowIndexInLattice === second.rowIndexInLattice &&
    first.columnIndexInLattice === second.columnIndexInLattice
  );
}

/**
 * Work out whose wall a rider just hit.
 * A cell that blocks but belongs to nobody's trail is the other rider's head:
 * they are standing on it right now, which is a head-on rather than a wall.
 */
function attributeBlocker(
  blocker: LatticeIndex,
  trails: LatticeMatrix[],
  riderIndex: number
): CrashCause {
  for (let index = 0; index < trails.length; index += 1) {
    if (isOccupied(trails[index], blocker)) {
      return index === riderIndex ? "ownTrail" : "opponentTrail";
    }
  }
  return "headOn";
}

/**
 * Resolve one tick for every rider at once.
 *
 * Moves are judged against the board as it stood at the start of the tick and
 * only then compared with each other, so a head-on takes both riders down.
 * Moving them one after another instead would let whoever the loop happened to
 * move first ride away from a collision the other one dies in.
 *
 * Returns one entry per player (null for riders that were already out); the
 * caller is responsible for writing the surviving moves into the lattices.
 */
export function resolveTickMoves(
  players: MovingPlayer[],
  grid: GridConfig,
  occupancy: LatticeMatrix,
  trails: LatticeMatrix[]
): Array<ResolvedMove | null> {
  const moves: Array<ResolvedMove | null> = players.map((player, riderIndex) => {
    if (!player.isAlive) return null;

    const { traversedEdgeCellInLattice, destinationVertexInLattice } = stepOnLattice(
      player.headLatticeIndex,
      player.direction
    );

    const move: ResolvedMove = {
      traversedEdge: traversedEdgeCellInLattice,
      destination: destinationVertexInLattice,
      crashed: false,
      cause: null,
    };

    if (
      !isInsideLattice(traversedEdgeCellInLattice, grid) ||
      !isInsideLattice(destinationVertexInLattice, grid)
    ) {
      move.crashed = true;
      move.cause = "arena";
      return move;
    }

    if (isOccupied(occupancy, traversedEdgeCellInLattice)) {
      move.crashed = true;
      move.cause = attributeBlocker(traversedEdgeCellInLattice, trails, riderIndex);
      return move;
    }

    if (isOccupied(occupancy, destinationVertexInLattice)) {
      move.crashed = true;
      move.cause = attributeBlocker(destinationVertexInLattice, trails, riderIndex);
      return move;
    }

    return move;
  });

  // Two riders aiming at the same free vertex: neither one can see the other
  // coming from the lattice alone, so they meet in the middle.
  for (let first = 0; first < moves.length; first += 1) {
    const firstMove = moves[first];
    if (!firstMove || firstMove.crashed) continue;

    for (let second = first + 1; second < moves.length; second += 1) {
      const secondMove = moves[second];
      if (!secondMove || secondMove.crashed) continue;

      if (isSameCell(firstMove.destination, secondMove.destination)) {
        firstMove.crashed = true;
        firstMove.cause = "headOn";
        secondMove.crashed = true;
        secondMove.cause = "headOn";
      }
    }
  }

  return moves;
}

/** A rider as the game keeps it: a head, a heading, and where it came from. */
export interface RiderState extends MovingPlayer {
  previousHeadLatticeIndex: LatticeIndex;
  ticksSurvived: number;
  isLayingWall: boolean;
  wallEnergy: number;
}

/**
 * Move every rider one tick and write the result into the lattices.
 *
 * Returns what took each rider down, or null if they are still riding. Riders
 * and lattices are mutated in place: this is the hot path, and copying the
 * board every tick to stay pure would cost more than it is worth.
 */
export function advanceRiders(
  riders: RiderState[],
  grid: GridConfig,
  occupancy: LatticeMatrix,
  trails: LatticeMatrix[]
): Array<CrashCause | null> {
  const moves = resolveTickMoves(riders, grid, occupancy, trails);
  const crashes: Array<CrashCause | null> = riders.map(() => null);

  moves.forEach((move, riderIndex) => {
    if (!move) return;

    const rider = riders[riderIndex];
    const fromVertex = rider.headLatticeIndex;

    if (move.crashed) {
      rider.isAlive = false;
      // Collapse the interpolation segment so a 3D bike parks on its last
      // vertex instead of sliding into the wall it just hit.
      rider.previousHeadLatticeIndex = fromVertex;
      crashes[riderIndex] = move.cause;
      return;
    }

    if (rider.isLayingWall) {
      occupy(occupancy, fromVertex);
      occupy(occupancy, move.traversedEdge);

      // The trail is only what gets drawn, so it holds the wall, not the head.
      occupy(trails[riderIndex], fromVertex);
      occupy(trails[riderIndex], move.traversedEdge);
    } else if (!trails.some((trail) => isOccupied(trail, fromVertex))) {
      // With the wall off there is nothing to leave behind, so the mark that
      // was only ever standing in for the bike goes with it — unless somebody's
      // wall is already there, in which case it was never ours to clear.
      setOccupancy(occupancy, fromVertex, false);
    }

    // The head blocks either way: without it another rider could ride straight
    // through the vertex this one is standing on.
    occupy(occupancy, move.destination);

    rider.previousHeadLatticeIndex = fromVertex;
    rider.headLatticeIndex = move.destination;
    rider.ticksSurvived += 1;
  });

  for (const rider of riders) {
    if (!rider.isAlive) continue;

    if (rider.isLayingWall) {
      rider.wallEnergy = Math.min(1, rider.wallEnergy + WALL_RECHARGE_PER_TICK);
    } else {
      rider.wallEnergy = Math.max(0, rider.wallEnergy - WALL_DRAIN_PER_TICK);
      // Out of power, the wall comes back on by itself.
      if (rider.wallEnergy <= 0) rider.isLayingWall = true;
    }
  }

  return crashes;
}

/** Human-readable round-end line for a crash. */
export function describeCrash(
  cause: CrashCause | null,
  riderName: string,
  opponentName: string
): string {
  switch (cause) {
    case "arena":
      return `${riderName} hit the arena wall.`;
    case "ownTrail":
      return `${riderName} crashed into their own wall.`;
    case "opponentTrail":
      return `${riderName} crashed into ${opponentName}'s wall.`;
    case "headOn":
      return `${riderName} and ${opponentName} went head-on.`;
    default:
      return `${riderName} crashed.`;
  }
}
