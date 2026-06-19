import type { StructuredDiff, DiffHunk, DiffLine as DiffLineType, DiffStat } from '../../../../main/diff-parse';

// --------------- Types (re-exported for UI convenience) ---------------

export type { StructuredDiff, DiffHunk, DiffLineType, DiffStat };

export type HunkAction = 'stage' | 'revert';

export type HunkActionEvent = {
  file: string;
  hunkIndex: number;
  action: HunkAction;
};

export type InlineComment = {
  file: string;
  line: number;
  text: string;
  id: string;
};

// --------------- Component ---------------

type DiffLineProps = {
  line: DiffLineType;
  lineNumber: number;
  isLast: boolean;
  onAddComment?: (lineNo: number) => void;
};

/**
 * Render a single diff line with line numbers, +/- markers, and content.
 *
 * Layout:
 * ┌─ oldLine ──┬─ newLine ──┬─ +/- ──┬─ content ─────────┐
 * │    12      │            │   -    │  old code here     │
 * │            │    13      │   +    │  new code here     │
 * │    14      │    15      │        │  context line      │
 * └────────────┴────────────┴────────┴────────────────────┘
 */
export function DiffLine({ line, lineNumber, isLast, onAddComment }: DiffLineProps) {
  const lineClass = `diff-line diff-line--${line.type}`;
  const oldStr = line.oldLineNo !== null ? String(line.oldLineNo) : '';
  const newStr = line.newLineNo !== null ? String(line.newLineNo) : '';

  return (
    <div className={lineClass}>
      <div className="diff-line__gutter">
        <span className="diff-line__old-no">{oldStr}</span>
        <span className="diff-line__new-no">{newStr}</span>
      </div>
      <div className="diff-line__prefix">
        {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
      </div>
      <div className="diff-line__content">
        <span>{line.content || ' '}</span>
        {!isLast && (
          <button
            className="diff-line__comment-btn"
            onClick={() => onAddComment?.(lineNumber)}
            title="添加行内评论"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
