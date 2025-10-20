// src/utils/canvasDrawing.js

/**
 * Draw the background and the crisp grid lines.
 */
export function drawGrid(context, canvasWidth, canvasHeight, grid) {
  context.fillStyle = '#0b0b0b';
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;

  context.beginPath();

  // Vertical lines
  for (let c = 0; c <= grid.columns; c += 1) {
    const x = Math.floor(c * cellWidth) + 0.5;
    context.moveTo(x, 0);
    context.lineTo(x, canvasHeight);
  }

  // Horizontal lines
  for (let r = 0; r <= grid.rows; r += 1) {
    const y = Math.floor(r * cellHeight) + 0.5;
    context.moveTo(0, y);
    context.lineTo(canvasWidth, y);
  }

  context.lineWidth = 1;
  context.strokeStyle = '#1c1c1c';
  context.stroke();
}

/**
 * Draw trails using the 2x lattice.
 * We paint on grid lines where lattice[r][c] = true for edges or vertices.
 * - Horizontal edge cells: (even row, odd col)
 * - Vertical   edge cells: (odd row, even col)
 * - Vertex cells (even, even) are also painted (thin dot) for continuity.
 */
export function drawLatticeTrails(
  context,
  canvasWidth,
  canvasHeight,
  grid,
  lattice
) {
  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;

  // Unified thickness for both edges and vertex joins
  const edgeThickness = 2; // px

  // Horizontal edges (even row, odd col)
  for (let lr = 0; lr <= grid.rows * 2; lr += 2) {
    for (let lc = 1; lc < grid.columns * 2; lc += 2) {
      if (!lattice[lr][lc]) continue;
      const yCenter = Math.floor((lr / 2) * cellHeight);
      const xLeft = Math.floor(((lc - 1) / 2) * cellWidth);
      context.fillStyle = 'rgba(0,229,255,0.9)';
      context.fillRect(
        xLeft + 1,
        yCenter - Math.floor(edgeThickness / 2),
        Math.ceil(cellWidth) - 2,
        edgeThickness
      );
    }
  }

  // Vertical edges (odd row, even col)
  for (let lr = 1; lr < grid.rows * 2; lr += 2) {
    for (let lc = 0; lc <= grid.columns * 2; lc += 2) {
      if (!lattice[lr][lc]) continue;
      const xCenter = Math.floor((lc / 2) * cellWidth);
      const yTop = Math.floor(((lr - 1) / 2) * cellHeight);
      context.fillStyle = 'rgba(0,229,255,0.9)';
      context.fillRect(
        xCenter - Math.floor(edgeThickness / 2),
        yTop + 1,
        edgeThickness,
        Math.ceil(cellHeight) - 2
      );
    }
  }

  // Vertices (even, even) as same-thickness squares (to join edge segments cleanly)
  context.fillStyle = 'rgba(0,229,255,0.9)';
  for (let lr = 0; lr <= grid.rows * 2; lr += 2) {
    for (let lc = 0; lc <= grid.columns * 2; lc += 2) {
      if (!lattice[lr][lc]) continue;
      const xCenter = Math.floor((lc / 2) * cellWidth);
      const yCenter = Math.floor((lr / 2) * cellHeight);
      context.fillRect(
        xCenter - Math.floor(edgeThickness / 2),
        yCenter - Math.floor(edgeThickness / 2),
        edgeThickness,
        edgeThickness
      );
    }
  }
}

/**
 * Draw player head at the current lattice vertex (even, even).
 */
export function drawHeadAtLatticeVertex(
  context,
  canvasWidth,
  canvasHeight,
  grid,
  headLattice,
  color
) {
  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;

  const xCenter = Math.floor((headLattice.c / 2) * cellWidth);
  const yCenter = Math.floor((headLattice.r / 2) * cellHeight);
  const size = Math.max(4, Math.floor(Math.min(cellWidth, cellHeight) * 0.25));

  context.fillStyle = color;
  context.fillRect(
    xCenter - Math.floor(size / 2),
    yCenter - Math.floor(size / 2),
    size,
    size
  );

  context.strokeStyle = '#000';
  context.lineWidth = 1;
  context.strokeRect(
    xCenter - Math.floor(size / 2) + 0.5,
    yCenter - Math.floor(size / 2) + 0.5,
    size - 1,
    size - 1
  );
}

export function drawOverlay(context, grid, tickCounter, running, message) {
  context.fillStyle = '#9ecbff';
  context.font = '12px ui-monospace, Menlo, Consolas, monospace';
  context.fillText(`Grid: ${grid.columns} × ${grid.rows}`, 8, 16);
  context.fillText(`Tick: ${tickCounter}`, 8, 32);
  context.fillText(`Running: ${running ? 'yes' : 'no'}`, 8, 48);
  context.fillText(`Controls — Move: Arrows/WASD | Reset: R`, 8, 64);

  if (!running && message) {
    context.fillStyle = '#ffffff';
    context.font = 'bold 18px ui-monospace, Menlo, Consolas, monospace';
    context.fillText(message, 8, 88);
  }
}

/**
 * Compose a full frame (grid → lattice trails → head → overlay).
 */
export function drawFrame({
  context,
  canvasWidth,
  canvasHeight,
  grid,
  lattice,
  headLattice,
  headColor,
  tickCounter,
  running,
  message,
}) {
  drawGrid(context, canvasWidth, canvasHeight, grid);
  drawLatticeTrails(context, canvasWidth, canvasHeight, grid, lattice);
  drawHeadAtLatticeVertex(
    context,
    canvasWidth,
    canvasHeight,
    grid,
    headLattice,
    headColor
  );
  drawOverlay(context, grid, tickCounter, running, message);
}
