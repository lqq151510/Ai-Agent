import { useCallback } from 'react';
import { DiffHunkView } from './DiffHunkView';
import type { StructuredDiff, HunkAction } from './DiffLine';

type DiffViewerProps = {
  diff: StructuredDiff;
  onHunkAction: (action: HunkAction, file: string, hunkIndex: number) => void;
  onAddComment?: (file: string, lineNo: number) => void;
  showActions?: boolean;
};

/**
 * Renders a single file's diff, including the file header and all hunks.
 */
export function DiffViewer({
  diff,
  onHunkAction,
  onAddComment,
  showActions = true,
}: DiffViewerProps) {
  const handleAction = useCallback(
    (action: HunkAction, file: string, hunkIndex: number) => {
      onHunkAction(action, file, hunkIndex);
    },
    [onHunkAction],
  );

  const statusBadge: Record<string, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
  };

  return (
    <div className="diff-viewer">
      {/* File header */}
      <div className="diff-viewer__file-header">
        <span className={`diff-viewer__status-badge diff-viewer__status-badge--${diff.status}`}>
          {statusBadge[diff.status] || '?'}
        </span>
        <span className="diff-viewer__file-path">{diff.file}</span>
        {diff.oldFile && diff.oldFile !== diff.file && (
          <span className="diff-viewer__old-path">← {diff.oldFile}</span>
        )}
        <span className="diff-viewer__hunk-count">
          {diff.hunks.length} 个块
        </span>
      </div>

      {/* No hunks for binary or empty diffs */}
      {diff.hunks.length === 0 && (
        <div className="diff-viewer__empty">（无差异内容）</div>
      )}

      {/* Hunks */}
      {diff.hunks.map((hunk, idx) => (
        <DiffHunkView
          key={idx}
          hunk={hunk}
          file={diff.file}
          hunkIndex={idx}
          onAction={handleAction}
          onAddComment={onAddComment}
          showActions={showActions}
        />
      ))}
    </div>
  );
}
