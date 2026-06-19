import { DiffLine } from './DiffLine';
import type { DiffHunk } from './DiffLine';
import type { HunkAction } from './DiffLine';

type DiffHunkViewProps = {
  hunk: DiffHunk;
  file: string;
  hunkIndex: number;
  onAction: (action: HunkAction, file: string, hunkIndex: number) => void;
  onAddComment?: (file: string, lineNo: number) => void;
  showActions?: boolean;
};

/**
 * Render a single hunk with Stage / Revert action buttons.
 */
export function DiffHunkView({
  hunk,
  file,
  hunkIndex,
  onAction,
  onAddComment,
  showActions = true,
}: DiffHunkViewProps) {
  // Compute addition/deletion count for this hunk
  const adds = hunk.lines.filter(l => l.type === 'add').length;
  const dels = hunk.lines.filter(l => l.type === 'del').length;

  // Compute global line number (1-based index in the full diff file)
  let globalLineNo = 1;
  for (let i = 0; i < hunkIndex; i++) {
    // This is approximate — we just use sequential numbering per hunk
    globalLineNo += 10; // spacer between hunks
  }

  return (
    <div className="diff-hunk">
      {/* Hunk header row */}
      <div className="diff-hunk__header">
        <code className="diff-hunk__header-text">{hunk.header}</code>
        <span className="diff-hunk__header-stats">
          <span className="diff-hunk__adds">+{adds}</span>
          <span className="diff-hunk__dels">-{dels}</span>
        </span>
        {showActions && (
          <div className="diff-hunk__actions">
            <button
              className="diff-hunk__btn diff-hunk__btn--stage"
              onClick={() => onAction('stage', file, hunkIndex)}
              title="暂存此块"
            >
              Stage
            </button>
            <button
              className="diff-hunk__btn diff-hunk__btn--revert"
              onClick={() => onAction('revert', file, hunkIndex)}
              title="还原此块"
            >
              Revert
            </button>
          </div>
        )}
      </div>

      {/* Hunk lines */}
      <div className="diff-hunk__lines">
        {hunk.lines.map((line, idx) => {
          const isLast = idx === hunk.lines.length - 1;
          const lineNo = globalLineNo + idx;
          return (
            <DiffLine
              key={idx}
              line={line}
              lineNumber={lineNo}
              isLast={isLast}
              onAddComment={(ln) => onAddComment?.(file, ln)}
            />
          );
        })}
      </div>
    </div>
  );
}
