// src/utils/inputHandlers.js

export function handleKeyDown(event, playerRef, resetRound) {
  const key = event.key.toLowerCase();

  if (key === 'r') {
    resetRound();
    return;
  }

  if (key === 'arrowup' || key === 'w')
    playerRef.current.pendingDirection = 'up';
  if (key === 'arrowdown' || key === 's')
    playerRef.current.pendingDirection = 'down';
  if (key === 'arrowleft' || key === 'a')
    playerRef.current.pendingDirection = 'left';
  if (key === 'arrowright' || key === 'd')
    playerRef.current.pendingDirection = 'right';
}
