import { useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { botForLevel } from '../config/riders';
import { INITIAL_LIVES, LEVEL_COUNT } from '../config/levels';
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

  const formattedScore = state.score.toString().padStart(8, '0');
  const formattedHighScore = game.highScore.toString().padStart(8, '0');
  const viewLabel = state.renderMode === '3d' ? '3D Cockpit' : '2D Classic';
  const shortViewLabel = state.renderMode === '3d' ? '3D' : '2D';

  function submitName(): void {
    actions.saveScoreAs(nameDraft);
  }

  const wallMeter =
    game.jetWallEnabled && state.gameState !== 'menu' ? (
      <div className='wall-meter'>
        <span className='wall-meter-label'>
          {game.isPlayerCuttingWall ? 'Wall off' : 'Jet wall'}
        </span>
        <span
          className='wall-meter-track'
          role='meter'
          aria-label='Jet wall power'
          aria-valuenow={game.wallEnergyPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className='wall-meter-fill'
            style={{
              width: `${game.wallEnergyPercent}%`,
              background: game.isPlayerCuttingWall ? '#ff5a3c' : game.playerColor,
            }}
          />
        </span>
      </div>
    ) : null;

  const livesPips = Array.from({ length: INITIAL_LIVES }, (_, index) => (
    <span
      key={index}
      className={`hud-pip is-life${index < state.lives ? '' : ' is-spent'}`}
    />
  ));

  const levelPips = Array.from({ length: LEVEL_COUNT }, (_, index) => (
    <span
      key={index}
      className={`hud-pip${index < state.level ? '' : ' is-spent'}`}
    />
  ));

  const hud = (
    <header className='hud'>
      {state.matchMode === 'versus' ? (
        <>
          <div className='hud-slot hud-slot-left'>
            <div className='hud-field'>
              <span className='hud-key'>Player one · arrows</span>
              <span className='hud-tally' style={{ color: game.playerColor }}>
                {game.playerLabel}: {state.roundWins[0]}
              </span>
            </div>
          </div>

          <div className='hud-slot hud-slot-center'>
            <span className='hud-key'>Rounds</span>
          </div>

          <div className='hud-slot hud-slot-right'>
            <div className='hud-field'>
              <span className='hud-key'>Player two · wasd</span>
              <span className='hud-tally' style={{ color: opponent.color }}>
                {opponent.name}: {state.roundWins[1]}
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className='hud-slot hud-slot-left'>
            <div className='hud-field'>
              <span className='hud-key'>Lives</span>
              <span className='hud-pips' aria-label={`${state.lives} lives left`}>
                {livesPips}
              </span>
            </div>
            <div className='hud-field'>
              <span className='hud-key'>
                Level {state.level}/{LEVEL_COUNT}
              </span>
              <span className='hud-pips' aria-hidden='true'>
                {levelPips}
              </span>
            </div>
          </div>

          <div className='hud-slot hud-slot-center'>
            <span className='hud-score-value' aria-label={`Score ${state.score}`}>
              {formattedScore}
            </span>
            <span className='hud-best'>Best {formattedHighScore}</span>
          </div>

          <div className='hud-slot hud-slot-right'>
            <span className='hud-view'>{shortViewLabel}</span>
            <div className='hud-field'>
              <span className='hud-key'>Rival</span>
              <span className='hud-rival' style={{ color: opponent.color }}>
                {opponent.name}
              </span>
            </div>
          </div>
        </>
      )}

      {wallMeter}
    </header>
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

  /*
   * The jet wall sat in the row above until it turned out nobody could find it:
   * an off switch among two on ones reads as greyed out, and a rule of the game
   * is not a preference like the sound. It gets its own line, its own words and
   * full contrast in both states.
   */
  const jetWallRule = (
    <button
      type='button'
      className={`rule-toggle${game.jetWallEnabled ? ' is-on' : ''}`}
      onClick={actions.toggleJetWall}
      aria-pressed={game.jetWallEnabled}
    >
      <span className='rule-toggle-name'>Jet Wall</span>
      <span className='rule-toggle-blurb'>cut your wall, leave a gap</span>
      <span className='rule-toggle-state'>{game.jetWallEnabled ? 'On' : 'Off'}</span>
    </button>
  );

  /**
   * Overlay copy and actions for the current state, in one place so the
   * variants can be read side by side.
   */
  function getOverlayConfig(): {
    title: string;
    titleSlot?: ReactNode;
    variant?: 'panel' | 'title';
    paragraph?: string;
    actions: OverlayAction[];
    actionsLayout?: 'row' | 'menu';
    showLeaderboard: boolean;
    maxRows?: number;
    extraContent?: ReactNode;
    footer?: ReactNode;
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
        {
          label: '2D Classic',
          note: 'the whole board',
          onSelect: () => actions.startRun('solo', '2d'),
        },
        {
          label: '3D Cockpit',
          note: 'from the saddle',
          onSelect: () => actions.startRun('solo', '3d'),
          onPrefetch: actions.prefetchCockpit,
        },
      ];

      // Two people need two halves of a keyboard, which a phone hasn't got.
      if (!game.isMobile) {
        menuActions.push({
          label: '2 Players',
          note: 'one keyboard',
          onSelect: () => actions.startRun('versus', '2d'),
        });
      }

      return {
        title: 'Lightcycle Arena',
        variant: 'title' as const,
        titleSlot: (
          <>
            <div className='wordmark'>
              <span className='wordmark-line'>Lightcycle</span>
              <span className='wordmark-line wordmark-line-two'>
                <span className='wordmark-rule' aria-hidden='true' />
                Arena
              </span>
            </div>
            <p className='title-tagline'>Can you escape the grid?</p>
          </>
        ),
        actions: menuActions,
        actionsLayout: 'menu' as const,
        showLeaderboard: true,
        // Three rows is a scoreboard; five is a page that needs scrolling.
        maxRows: 3,
        // What you came to press goes first; how you want it set up follows.
        footer: (
          <>
            {jetWallRule}
            {game.jetWallEnabled && (
              <p className='menu-hint'>
                Space switches your wall off and leaves a gap in it. So does
                theirs — and they know how to use it.
              </p>
            )}
            {preferenceToggles}
            <p className='menu-hint'>
              Arrows steer · R resets · Esc pauses · Enter starts in {viewLabel}
            </p>
          </>
        ),
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
        extraContent: (
          <>
            {state.roundMessage && (
              <p className='verdict-line'>{state.roundMessage}</p>
            )}
            {hasNextRider && <NextRiderNote level={state.level + 1} />}
          </>
        ),
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
            <span className='final-score'>
              <span className='final-score-key'>Final score</span>
              <span className='final-score-value'>{formattedScore}</span>
            </span>
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
      titleSlot={overlayConfig.titleSlot}
      variant={overlayConfig.variant}
      paragraph={overlayConfig.paragraph}
      actions={overlayConfig.actions}
      actionsLayout={overlayConfig.actionsLayout}
      showLeaderboard={overlayConfig.showLeaderboard}
      leaderboardEntries={game.leaderboard}
      maxRows={overlayConfig.maxRows ?? 5}
      extraContent={overlayConfig.extraContent}
      footer={overlayConfig.footer}
    />
  ) : null;

  const arena = (
    <div className={`canvas-zone${state.renderMode === '2d' ? ' is-flat' : ''}`}>
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

  // Nothing to report before a run starts, and a title screen wearing a HUD
  // is the surest sign of a web page pretending to be a game.
  const hudZone =
    state.gameState === 'menu' ? null : <div className='hud-zone'>{hud}</div>;

  // On the title screen there is nothing to steer, so the pad stands down and
  // the screen belongs to the game's name rather than half of each.
  const controlsZone =
    state.gameState === 'menu' ? null : (
      <div className='controls-zone'>
        <DPadOverlay
          onInput={actions.steer}
          onReset={actions.restartRound}
          steeringMode={game.steeringMode}
          onCut={game.jetWallEnabled ? actions.cutWall : undefined}
          isCutting={game.isPlayerCuttingWall}
        />
      </div>
    );

  return game.isMobile ? (
    <div className='mobile-stage'>
      {hudZone}
      {arena}
      {controlsZone}
    </div>
  ) : (
    <div className='game-stage'>
      {hudZone}
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
