import { useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';

import { botForLevel } from '../config/riders';
import { LEVEL_COUNT } from '../config/levels';
import { useLightcycleGame } from '../game/useLightcycleGame';
import { DPadOverlay } from './DPadOverlay';
import { GameOverlay } from './GameOverlay';
import type { OverlayAction } from './GameOverlay';

import '../styles/gameCanvasOverlay.css';
import '../styles/gameUI.css';

/**
 * The arena's chrome: HUD, overlays, canvases and the on-screen pad.
 *
 * Every rule and every effect lives in useLightcycleGame; what is left here is
 * the question of what the player sees.
 */
export function GameCanvas(): JSX.Element {
  const game = useLightcycleGame();
  const { state, opponent, actions } = game;

  // Purely a text field: the game only hears about it when it is submitted.
  const [nameDraft, setNameDraft] = useState<string>('');

  const hearts = '❤'.repeat(Math.max(0, state.lives));
  const formattedScore = state.score.toString().padStart(8, '0');
  const formattedHighScore = game.highScore.toString().padStart(8, '0');
  const viewLabel = state.renderMode === '3d' ? '3D Cockpit' : '2D Classic';
  const shortViewLabel = state.renderMode === '3d' ? '3D' : '2D';

  function submitName(): void {
    actions.saveScoreAs(nameDraft);
  }

  const hud = (
    <div className='game-ui'>
      <h1 className='game-title'>Lightcycle Arena</h1>

      {state.matchMode === 'versus' ? (
        <div className='hud-container'>
          <div className='hud-row'>
            <span className='hud-score' style={{ color: game.playerColor }}>
              {game.playerLabel}: {state.roundWins[0]}
            </span>
            <span className='hud-highscore-label'>Rounds</span>
            <span className='hud-score' style={{ color: opponent.color }}>
              {opponent.name}: {state.roundWins[1]}
            </span>
          </div>
          <div className='hud-row' style={{ opacity: 0.9 }}>
            <span>P1: Arrows</span>
            <span>View: {shortViewLabel}</span>
            <span>P2: WASD</span>
          </div>
        </div>
      ) : (
        <div className='hud-container'>
          <div className='hud-row'>
            <span className='hud-lives'>Lives: {hearts || '—'}</span>
            <span className='hud-highscore-label'>High Score</span>
          </div>
          <div className='hud-row'>
            <span className='hud-score'>Score: {formattedScore}</span>
            <span className='hud-highscore-value'>{formattedHighScore}</span>
          </div>
          <div className='hud-row' style={{ opacity: 0.9 }}>
            <span>
              Level: {state.level}/{LEVEL_COUNT}
            </span>
            <span>View: {shortViewLabel}</span>
            <span style={{ color: opponent.color }}>vs {opponent.name}</span>
          </div>
        </div>
      )}
    </div>
  );

  const preferenceToggles = (
    <div className='overlay-toggles'>
      <button type='button' onClick={actions.toggleSound} aria-pressed={game.soundEnabled}>
        Sound: {game.soundEnabled ? 'On' : 'Off'}
      </button>
      <button type='button' onClick={actions.toggleGlow} aria-pressed={game.glowEnabled}>
        Glow: {game.glowEnabled ? 'On' : 'Off'}
      </button>
    </div>
  );

  /**
   * Overlay copy and actions for the current state, in one place so the
   * variants can be read side by side.
   */
  function getOverlayConfig(): {
    title: string;
    paragraph?: string;
    actions: OverlayAction[];
    showLeaderboard: boolean;
    extraContent?: ReactNode;
    styleOverride?: CSSProperties;
  } {
    if (state.isPaused && state.gameState === 'playing') {
      return {
        title: 'Paused',
        paragraph: 'The arena waits.',
        actions: [
          { label: 'Resume', onSelect: actions.resume },
          { label: 'Menu', variant: 'secondary', onSelect: actions.backToMenu },
        ],
        showLeaderboard: false,
      };
    }

    if (state.gameState === 'menu') {
      const menuActions: OverlayAction[] = [
        { label: '2D Classic', onSelect: () => actions.startRun('solo', '2d') },
        {
          label: '3D Cockpit',
          onSelect: () => actions.startRun('solo', '3d'),
          onPrefetch: actions.prefetchCockpit,
        },
      ];

      // Two people need two halves of a keyboard, which a phone hasn't got.
      if (!game.isMobile) {
        menuActions.push({
          label: '2 Players',
          variant: 'secondary',
          onSelect: () => actions.startRun('versus', '2d'),
        });
      }

      return {
        title: 'Lightcycle Arena',
        paragraph:
          '2D Classic: arrows steer by compass · 3D Cockpit: left/right turn the bike · R resets · P pauses',
        actions: menuActions,
        showLeaderboard: true,
        extraContent: (
          <>
            {preferenceToggles}
            <p className='menu-hint'>
              Enter starts a solo run in the last view used ({viewLabel})
            </p>
          </>
        ),
        styleOverride: { background: 'rgba(0,0,0,0.65)' },
      };
    }

    if (state.gameState === 'roundEnd') {
      const wonRound = state.roundOutcome === 'win';
      const title =
        state.matchMode === 'versus'
          ? state.roundOutcome === 'draw'
            ? 'Draw'
            : `${wonRound ? game.playerLabel : opponent.name} takes the round`
          : state.roundOutcome === 'draw'
            ? 'Both riders down'
            : wonRound
              ? `You win! ${opponent.name} is derezzed.`
              : `${opponent.name} wins! You crashed.`;

      const hasNextRider = state.matchMode === 'solo' && wonRound && state.level < LEVEL_COUNT;

      return {
        title,
        paragraph: state.roundMessage ?? undefined,
        actions: [
          {
            label:
              state.matchMode === 'versus'
                ? 'Next round'
                : wonRound
                  ? 'Next Level'
                  : 'Retry',
            onSelect: actions.continueAfterRound,
          },
          { label: 'Menu', variant: 'secondary', onSelect: actions.backToMenu },
        ],
        showLeaderboard: state.matchMode === 'solo',
        extraContent: hasNextRider ? <NextRiderNote level={state.level + 1} /> : undefined,
      };
    }

    if (state.gameState === 'gameOver') {
      const title = state.gameOverReason === 'victory' ? 'Run Complete' : 'Game Over';

      return {
        title,
        actions: [
          { label: 'Play Again', onSelect: actions.playAgain },
          { label: 'Menu', variant: 'secondary', onSelect: actions.backToMenu },
        ],
        showLeaderboard: true,
        extraContent: (
          <>
            <p style={{ marginTop: 6 }}>Your final score: {formattedScore}</p>
            {game.needsNameForSave ? (
              <div className='save-score-form'>
                <input
                  type='text'
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitName();
                  }}
                  maxLength={20}
                  placeholder='Your name'
                  aria-label='Player name'
                  autoComplete='off'
                />
                <button onClick={submitName} disabled={nameDraft.trim().length === 0}>
                  Save score
                </button>
              </div>
            ) : (
              game.playerName && (
                <p className='menu-hint'>
                  Saved as {game.playerName} ·{' '}
                  <button
                    type='button'
                    className='link-button'
                    onClick={() => {
                      setNameDraft(game.playerName ?? '');
                      actions.requestNameChange();
                    }}
                  >
                    change name
                  </button>
                </p>
              )
            )}
          </>
        ),
      };
    }

    return { title: '', actions: [], showLeaderboard: false };
  }

  const overlayVisible = state.gameState !== 'playing' || state.isPaused;
  const overlayConfig = overlayVisible ? getOverlayConfig() : null;
  const stateOverlay = overlayConfig ? (
    <GameOverlay
      title={overlayConfig.title}
      paragraph={overlayConfig.paragraph}
      actions={overlayConfig.actions}
      showLeaderboard={overlayConfig.showLeaderboard}
      leaderboardEntries={game.leaderboard}
      maxRows={5}
      extraContent={overlayConfig.extraContent}
      styleOverride={overlayConfig.styleOverride}
    />
  ) : null;

  const arena = (
    <div className='canvas-zone'>
      <canvas
        key={game.canvasKey}
        ref={game.canvasRef}
        className={state.renderMode === '3d' ? 'arena-canvas-3d' : undefined}
      />
      {state.renderMode === '3d' && (
        <canvas
          ref={game.minimapCanvasRef}
          className='minimap-canvas'
          aria-hidden='true'
        />
      )}
      {stateOverlay}
    </div>
  );

  return game.isMobile ? (
    <div className='mobile-stage'>
      <div className='hud-zone'>{hud}</div>
      {arena}
      <div className='controls-zone'>
        <DPadOverlay
          onInput={actions.steer}
          onReset={actions.restartRound}
          steeringMode={game.steeringMode}
        />
      </div>
    </div>
  ) : (
    <div className='game-stage'>
      <div className='hud-zone'>{hud}</div>
      {arena}
    </div>
  );
}

/** Who is waiting on the next rung, and what they think of you. */
function NextRiderNote({ level }: { level: number }): JSX.Element {
  const nextRider = botForLevel(level);

  return (
    <p className='menu-hint'>
      Next up: <span style={{ color: nextRider.color }}>{nextRider.name}</span> —{' '}
      {nextRider.tagline}
    </p>
  );
}
