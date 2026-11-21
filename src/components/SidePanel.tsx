// The editor's side panel: Script and Setup pages over one tabpanel shell,
// with the errors band under whichever page is open.
//
// Clock-free: a controlled textarea compares its whole value on every render,
// so the panel takes the reached event index rather than the time, and the
// pages and errors band are memoized. Only the insert menu's label follows the
// clock, by subscribing to it itself. Callback props must be stable, or the
// memos do nothing.

import { memo, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import type { BoardOrientation } from '../lib/boardOrientation';
import type { Clock } from '../lib/clock';
import { fmtTime, type TimelineEvent } from '../lib/timeline';
import { InsertMenu } from './InsertMenu';
import { MoveList } from './MoveList';
import { SYNTAX_HINT } from './SyntaxHint';
import type { NarrationTrack } from './useNarration';
import type { StructureSnapshot } from '../lib/world';

export type PanelTab = 'script' | 'setup';
export type ScriptView = 'moves' | 'text';

// Literal ids rather than `useId`: one panel per document, no server render.
const editorLabelId = 'script-editor-label';
const subtitleLabelId = 'subtitle-label';
const narrationLabelId = 'narration-label';
const narrationFileInputId = 'narration-file';
const narrationErrorId = 'narration-error';
const scriptImportErrorId = 'script-import-error';
const subtitleImportErrorId = 'subtitle-import-error';
const setupTabId = 'setup-tab';
const scriptTabId = 'script-tab';
const panelId = 'side-panel';
const fenErrorId = 'fen-error';

// Error rows shown before the rest collapse behind a count.
const ERRORS_COLLAPSED_ROWS = 3;

// Resets the input so re-picking the same file fires change again.
function takeSelectedFile(e: ChangeEvent<HTMLInputElement>): File | null {
  const file = e.currentTarget.files?.[0];
  e.currentTarget.value = '';
  return file ?? null;
}

// A labelled button driving a hidden file input. `id` is only for an
// importer named by a `<label htmlFor>` (narration).
function ImportButton({
  id,
  accept,
  label,
  onFile,
  describedBy,
}: {
  id?: string;
  accept: string;
  label: string;
  onFile: (file: File) => void;
  describedBy?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="upload-btn import-btn"
        aria-label={label}
        aria-describedby={describedBy}
        onClick={() => inputRef.current?.click()}
      >
        Import
      </button>
      <input
        id={id}
        ref={inputRef}
        className="file-input"
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = takeSelectedFile(e);
          if (file) onFile(file);
        }}
      />
    </>
  );
}

type LineError = { line: number; error: string };

type PanelProps = {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;

  // Script page
  scriptView: ScriptView;
  onScriptView: (view: ScriptView) => void;
  scriptText: string;
  onScriptText: (text: string) => void;
  scriptFileName: string | null;
  undoText: string | null;
  onUndo: (text: string) => void;
  onImportScript: (file: File) => void;
  events: TimelineEvent[];
  snapshots: readonly StructureSnapshot[];
  reachedEventIndex: number;
  errorLines: ReadonlySet<number>;
  playing: boolean;
  onSeek: (t: number) => void;
  onRetime: (line: number, t: number) => number | null;
  onDelete: (lines: number[]) => void;

  // Setup page
  fenText: string;
  onFenText: (text: string) => void;
  orientation: BoardOrientation;
  onOrientation: (orientation: BoardOrientation) => void;
  subtitleText: string;
  onSubtitleText: (text: string) => void;
  subtitleFileName: string | null;
  onImportSubtitles: (file: File) => void;
  narration: NarrationTrack | null;
  onImportNarration: (file: File) => void;
  onClearNarration: () => void;

  // Errors band, in display order: setup and operation errors, then script
  // lines (already line-sorted by buildWorld), then subtitle lines.
  fenError: string | null;
  narrationError: string | null;
  boardExportError: string | null;
  scriptEditError: string | null;
  scriptImportError: string | null;
  subtitleImportError: string | null;
  scriptErrors: readonly LineError[];
  subtitleErrors: readonly LineError[];
  errorsExpanded: boolean;
  onErrorsExpanded: (expanded: boolean) => void;
};

// The insert menu's props stay out of the pages' memoized props.
type SidePanelProps = PanelProps & {
  onInsert: (body: string) => void;
  clock: Clock;
};

export const SidePanel = memo(function SidePanel({
  onInsert,
  clock,
  ...p
}: SidePanelProps) {
  const onTabKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const next = p.tab === 'script' ? 'setup' : 'script';
    p.onTab(next);
    // Both tab buttons stay mounted, so focus follows selection synchronously.
    e.currentTarget
      .querySelector<HTMLElement>(`#${next === 'script' ? scriptTabId : setupTabId}`)
      ?.focus();
  };

  return (
    <aside className="side-col">
      <div
        className="mode-tabs"
        role="tablist"
        aria-orientation="horizontal"
        aria-label="Side panel mode"
        onKeyDown={onTabKeyDown}
      >
        <button
          type="button"
          role="tab"
          id={scriptTabId}
          aria-controls={panelId}
          aria-selected={p.tab === 'script'}
          tabIndex={p.tab === 'script' ? 0 : -1}
          className="tab-btn"
          onClick={() => p.onTab('script')}
        >
          Script
        </button>
        <button
          type="button"
          role="tab"
          id={setupTabId}
          aria-controls={panelId}
          aria-selected={p.tab === 'setup'}
          tabIndex={p.tab === 'setup' ? 0 : -1}
          className="tab-btn"
          onClick={() => p.onTab('setup')}
        >
          Setup
        </button>
      </div>
      {/* One tabpanel for both pages, so the errors band shows on either. */}
      <div
        className="editor"
        role="tabpanel"
        id={panelId}
        aria-labelledby={p.tab === 'script' ? scriptTabId : setupTabId}
      >
        {p.tab === 'script' ? (
          <>
            <ScriptPage {...p} />
            {/* Insertion reuses the board gesture's commit path. */}
            {p.scriptView === 'moves' && <InsertMenu onInsert={onInsert} clock={clock} />}
          </>
        ) : (
          <SetupPage {...p} />
        )}
        <ErrorsBand {...p} />
      </div>
    </aside>
  );
});

const ScriptPage = memo(function ScriptPage(p: PanelProps) {
  const { undoText } = p;
  return (
    <>
      <div className="panel-header">
        <div className="panel-title-row">
          {/* Names the editor via aria-labelledby. */}
          <h2 className="sr-only" id={editorLabelId}>Script</h2>
          <div className="subtitle-actions">
            <div className="view-toggle" role="group" aria-label="Script view mode">
              <button
                type="button"
                className="view-btn"
                aria-pressed={p.scriptView === 'moves'}
                onClick={() => p.onScriptView('moves')}
              >
                Moves
              </button>
              <button
                type="button"
                className="view-btn"
                aria-pressed={p.scriptView === 'text'}
                onClick={() => p.onScriptView('text')}
              >
                Text
              </button>
            </div>
            {p.scriptFileName && <span className="subtitle-file">{p.scriptFileName}</span>}
            {undoText != null && (
              <button
                type="button"
                className="upload-btn"
                aria-label="Undo last board edit"
                onClick={() => p.onUndo(undoText)}
              >
                Undo
              </button>
            )}
            <ImportButton
              accept=".gambit,.txt,text/plain"
              label="Import script file"
              describedBy={p.scriptImportError ? scriptImportErrorId : undefined}
              onFile={p.onImportScript}
            />
          </div>
        </div>
        {/* One hint per view: syntax belongs to Text, gestures to Moves. */}
        {p.scriptView === 'text' ? (
          SYNTAX_HINT
        ) : (
          <p className="panel-hint">
            Drag to move · right-drag arrow · right-click highlight
          </p>
        )}
      </div>
      {p.scriptView === 'moves' ? (
        <MoveList
          events={p.events}
          snapshots={p.snapshots}
          reachedEventIndex={p.reachedEventIndex}
          errorLines={p.errorLines}
          onSeek={p.onSeek}
          playing={p.playing}
          labelId={editorLabelId}
          onRetime={p.onRetime}
          onDelete={p.onDelete}
        />
      ) : (
        <textarea
          className="script-textarea"
          spellCheck={false}
          value={p.scriptText}
          aria-labelledby={editorLabelId}
          onChange={(e) => p.onScriptText(e.target.value)}
        />
      )}
    </>
  );
});

const SetupPage = memo(function SetupPage(p: PanelProps) {
  const { narration } = p;
  return (
    <>
      <h2 className="sr-only">Setup</h2>
      <div className="fen-field">
        <label htmlFor="start-fen">Start FEN</label>
        <input
          id="start-fen"
          type="text"
          spellCheck={false}
          value={p.fenText}
          aria-invalid={p.fenError ? true : undefined}
          aria-describedby={p.fenError ? fenErrorId : undefined}
          aria-errormessage={p.fenError ? fenErrorId : undefined}
          onChange={(e) => p.onFenText(e.target.value)}
        />
      </div>
      <div className="orientation-field">
        <span className="orientation-label">Board orientation</span>
        <div className="view-toggle" role="group" aria-label="Board orientation">
          <button
            type="button"
            className="view-btn"
            aria-pressed={p.orientation === 'white'}
            onClick={() => p.onOrientation('white')}
          >
            White
          </button>
          <button
            type="button"
            className="view-btn"
            aria-pressed={p.orientation === 'black'}
            onClick={() => p.onOrientation('black')}
          >
            Black
          </button>
        </div>
      </div>
      <section className="subtitle-editor grow" aria-labelledby={subtitleLabelId}>
        <div className="subtitle-editor-head">
          <label id={subtitleLabelId} htmlFor="subtitle-text">Subtitles</label>
          <div className="subtitle-actions">
            {p.subtitleFileName && <span className="subtitle-file">{p.subtitleFileName}</span>}
            <ImportButton
              accept=".srt,text/plain"
              label="Import subtitle file"
              describedBy={p.subtitleImportError ? subtitleImportErrorId : undefined}
              onFile={p.onImportSubtitles}
            />
          </div>
        </div>
        <textarea
          id="subtitle-text"
          className="subtitle-textarea"
          spellCheck={false}
          value={p.subtitleText}
          onChange={(e) => p.onSubtitleText(e.target.value)}
          placeholder={'1\n00:00:01,000 --> 00:00:04,000\nCentral control is established.'}
        />
      </section>
      <section className="subtitle-editor" aria-labelledby={narrationLabelId}>
        <div className="subtitle-editor-head">
          <label id={narrationLabelId} htmlFor={narrationFileInputId}>Narration audio</label>
          <div className="subtitle-actions">
            {narration && (
              <>
                <span className="subtitle-file">{narration.name}</span>
                {/* Outside the truncating span so the duration never ellipsizes. */}
                <span className="narration-duration">
                  {fmtTime(narration.duration, 'always')}
                </span>
                <button
                  type="button"
                  className="upload-btn"
                  aria-label="Remove narration audio"
                  onClick={p.onClearNarration}
                >
                  Remove
                </button>
              </>
            )}
            <ImportButton
              id={narrationFileInputId}
              accept="audio/*"
              label="Import narration audio file"
              describedBy={p.narrationError ? narrationErrorId : undefined}
              onFile={p.onImportNarration}
            />
          </div>
        </div>
        <p className="panel-hint narration-hint">
          Follows the timeline. Kept with the script across reloads.
        </p>
      </section>
    </>
  );
});

// Rows key by index, not `tag`: one SRT line can raise two errors.
const ErrorsBand = memo(function ErrorsBand(p: PanelProps) {
  const rows: { tag: string; text: string; id?: string }[] = [];
  if (p.fenError) rows.push({ tag: 'FEN', text: p.fenError, id: fenErrorId });
  if (p.narrationError) rows.push({ tag: 'AUD', text: p.narrationError, id: narrationErrorId });
  if (p.boardExportError) rows.push({ tag: 'PNG', text: p.boardExportError });
  if (p.scriptEditError) rows.push({ tag: 'EDIT', text: p.scriptEditError });
  if (p.scriptImportError) {
    rows.push({ tag: 'SCRIPT', text: p.scriptImportError, id: scriptImportErrorId });
  }
  if (p.subtitleImportError) {
    rows.push({ tag: 'SRT', text: p.subtitleImportError, id: subtitleImportErrorId });
  }
  for (const er of p.scriptErrors) rows.push({ tag: `L${er.line}`, text: er.error });
  for (const er of p.subtitleErrors) rows.push({ tag: `S${er.line}`, text: er.error });
  if (rows.length === 0) return null;

  const collapsed = !p.errorsExpanded && rows.length > ERRORS_COLLAPSED_ROWS;
  return (
    // role="status", not alert: errors update as the user types.
    <div className={`errors${p.errorsExpanded ? ' errors--expanded' : ''}`} role="status">
      {(collapsed ? rows.slice(0, ERRORS_COLLAPSED_ROWS) : rows).map((row, i) => (
        <div key={i} className="err-row">
          <span className="err-line">{row.tag}</span>
          <span id={row.id}>{row.text}</span>
        </div>
      ))}
      {rows.length > ERRORS_COLLAPSED_ROWS && (
        <button
          type="button"
          className="errors-toggle"
          aria-expanded={p.errorsExpanded}
          onClick={() => p.onErrorsExpanded(!p.errorsExpanded)}
        >
          {collapsed ? `Show ${rows.length - ERRORS_COLLAPSED_ROWS} more` : 'Show fewer'}
        </button>
      )}
    </div>
  );
});
