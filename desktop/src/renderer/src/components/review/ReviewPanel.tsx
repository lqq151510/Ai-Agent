import { useState, useCallback, useEffect } from 'react';
import { DiffViewer } from './DiffViewer';
import type { StructuredDiff, HunkAction } from './DiffLine';
import './review.css';

// --------------- Types ---------------

type FileEntry = {
  file: string;
  status: string;
  selected: boolean;
};

export type ReviewPanelProps = {
  /** Git project path (the workspace). */
  projectPath: string;
  /** Fired when the user wants to close/hide the panel. */
  onClose?: () => void;
};

// --------------- Component ---------------

/**
 * Review Panel — shows a list of changed files on the left and a detailed
 * diff view on the right, with stage/revert/commit/push actions.
 *
 * Layout:
 * ┌───────────────────────────────────────────────────────────┐
 * │  审查                  [Commit] [Push] [创建 PR]     [✕] │
 * ├──────────────┬────────────────────────────────────────────┤
 * │ 文件列表     │ Diff 视图                                  │
 * │ ☐ src/a.ts  │ @@ -12,7 +12,8 @@                          │
 * │ ☐ src/b.ts  │  - old code                                 │
 * │              │  + new code                     [Stage]     │
 * │              │                              [Revert]     │
 * └──────────────┴────────────────────────────────────────────┘
 */
export function ReviewPanel({ projectPath, onClose }: ReviewPanelProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [diffs, setDiffs] = useState<StructuredDiff[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Load diffs on mount
  useEffect(() => {
    if (!projectPath) {
      setLoading(false);
      setError('未选择工作区');
      return;
    }
    loadDiffs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const loadDiffs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw: StructuredDiff[] = await window.electronAPI?.invoke('review:get-diff', projectPath) ?? [];
      setDiffs(raw);

      // Build file list
      const fileList: FileEntry[] = raw.map(d => ({
        file: d.file,
        status: d.status,
        selected: true,
      }));
      setFiles(fileList);

      // Auto-select first file
      if (fileList.length > 0 && !selectedFile) {
        setSelectedFile(fileList[0].file);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 diff 失败');
    } finally {
      setLoading(false);
    }
  }, [projectPath, selectedFile]);

  // Get diff for selected file
  const selectedDiff = diffs.find(d => d.file === selectedFile) || null;

  // Toggle file selection
  const toggleFile = useCallback((file: string) => {
    setFiles(prev => prev.map(f =>
      f.file === file ? { ...f, selected: !f.selected } : f,
    ));
  }, []);

  // Handle hunk action
  const handleHunkAction = useCallback(async (action: HunkAction, file: string, hunkIndex: number) => {
    const channel = action === 'stage' ? 'review:stage-hunk' : 'review:revert-hunk';
    try {
      const ok: boolean = await window.electronAPI?.invoke(channel, projectPath, file, hunkIndex);
      if (ok) {
        setActionMsg(`${action === 'stage' ? '已暂存' : '已还原'} ${file} 的块 #${hunkIndex + 1}`);
        setTimeout(() => setActionMsg(null), 2000);
        // Reload diffs
        await loadDiffs();
      } else {
        setActionMsg(`操作失败: ${file} 块 #${hunkIndex + 1}`);
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (err) {
      setActionMsg(`操作异常: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setActionMsg(null), 3000);
    }
  }, [projectPath, loadDiffs]);

  // Handle stage file
  const handleStageFile = useCallback(async (file: string) => {
    try {
      const ok: boolean = await window.electronAPI?.invoke('review:stage-file', projectPath, file);
      if (ok) {
        setActionMsg(`已暂存 ${file}`);
        setTimeout(() => setActionMsg(null), 2000);
        await loadDiffs();
      }
    } catch (err) {
      setActionMsg(`暂存失败: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setActionMsg(null), 3000);
    }
  }, [projectPath, loadDiffs]);

  // Handle revert file
  const handleRevertFile = useCallback(async (file: string) => {
    if (!confirm(`确认还原 ${file} 的所有更改？此操作不可撤销。`)) return;
    try {
      const ok: boolean = await window.electronAPI?.invoke('review:revert-file', projectPath, file);
      if (ok) {
        setActionMsg(`已还原 ${file}`);
        setTimeout(() => setActionMsg(null), 2000);
        await loadDiffs();
      }
    } catch (err) {
      setActionMsg(`还原失败: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setActionMsg(null), 3000);
    }
  }, [projectPath, loadDiffs]);

  // Commit
  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    try {
      const result = await window.electronAPI?.invoke('review:commit', projectPath, commitMsg.trim());
      if (result?.success) {
        setActionMsg(`已提交: ${result.commitHash || ''}`);
        setShowCommitDialog(false);
        setCommitMsg('');
        setTimeout(() => setActionMsg(null), 3000);
        await loadDiffs();
      } else {
        setActionMsg(`提交失败: ${result?.error || '未知错误'}`);
        setTimeout(() => setActionMsg(null), 5000);
      }
    } catch (err) {
      setActionMsg(`提交异常: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setActionMsg(null), 5000);
    }
  }, [projectPath, commitMsg, loadDiffs]);

  // Push
  const handlePush = useCallback(async () => {
    try {
      const result = await window.electronAPI?.invoke('review:push', projectPath);
      if (result?.success) {
        setActionMsg('推送成功');
      } else {
        setActionMsg(`推送失败: ${result?.error || '未知错误'}`);
      }
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err) {
      setActionMsg(`推送异常: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setActionMsg(null), 5000);
    }
  }, [projectPath]);

  // --- Computed ---
  const selectedCount = files.filter(f => f.selected).length;
  const selectedDiffs = diffs.filter(d => files.find(f => f.file === d.file && f.selected));

  // Render
  return (
    <div className="review-panel">
      {/* Header bar */}
      <div className="review-panel__header">
        <span className="review-panel__title">审查</span>
        <span className="review-panel__file-count">
          {loading ? '加载中...' : `${files.length} 个文件 (已选 ${selectedCount})`}
        </span>
        <div className="review-panel__actions">
          <button
            className="review-panel__action-btn"
            onClick={() => setShowCommitDialog(true)}
            disabled={loading || files.length === 0}
            title="提交变更"
          >
            Commit
          </button>
          <button
            className="review-panel__action-btn"
            onClick={handlePush}
            disabled={loading}
            title="推送到远程"
          >
            Push
          </button>
          <button
            className="review-panel__action-btn"
            onClick={async () => {
              try {
                const currentBranch = await window.electronAPI?.invoke('git:get-current-branch', projectPath);
                const title = prompt('PR 标题:', `[codex] ${currentBranch || ''}`);
                if (!title) return;
                const result = await window.electronAPI?.invoke('review:create-pr', projectPath, { title });
                if (result?.success && result?.url) {
                  setActionMsg(`PR 已创建: ${result.url}`);
                } else {
                  setActionMsg(`创建 PR 失败: ${result?.error || ''}`);
                }
                setTimeout(() => setActionMsg(null), 5000);
              } catch (err) {
                setActionMsg(`PR 创建异常: ${err instanceof Error ? err.message : String(err)}`);
                setTimeout(() => setActionMsg(null), 5000);
              }
            }}
            disabled={loading}
            title="创建 Pull Request"
          >
            PR
          </button>
          {onClose && (
            <button className="review-panel__close-btn" onClick={onClose}>✕</button>
          )}
        </div>
      </div>

      {/* Action toast */}
      {actionMsg && (
        <div className="review-panel__toast">{actionMsg}</div>
      )}

      {/* Body: file list + diff view */}
      <div className="review-panel__body">
        {/* File list */}
        <div className="review-panel__file-list">
          {loading && <div className="review-panel__placeholder">加载中...</div>}
          {error && <div className="review-panel__error">{error}</div>}
          {!loading && !error && files.length === 0 && (
            <div className="review-panel__placeholder">无变更</div>
          )}
          {files.map(entry => (
            <div
              key={entry.file}
              className={`review-panel__file-item${entry.file === selectedFile ? ' review-panel__file-item--active' : ''}`}
              onClick={() => setSelectedFile(entry.file)}
            >
              <input
                type="checkbox"
                checked={entry.selected}
                onChange={() => toggleFile(entry.file)}
                onClick={e => e.stopPropagation()}
                className="review-panel__file-checkbox"
              />
              <span className={`review-panel__file-status review-panel__file-status--${entry.status}`}>
                {entry.status === 'modified' ? 'M' : entry.status === 'added' ? 'A' : entry.status === 'deleted' ? 'D' : '?'}
              </span>
              <span className="review-panel__file-name">{entry.file.split('/').pop()}</span>
              <span className="review-panel__file-path">{entry.file.split('/').slice(0, -1).join('/')}</span>
            </div>
          ))}
        </div>

        {/* Diff view */}
        <div className="review-panel__diff">
          {!selectedFile && !loading && (
            <div className="review-panel__placeholder">选择一个文件查看变更</div>
          )}
          {selectedDiff && (
            <DiffViewer
              diff={selectedDiff}
              onHunkAction={handleHunkAction}
            />
          )}
          {/* File-level actions */}
          {selectedFile && (
            <div className="review-panel__file-actions">
              <button
                className="review-panel__file-action-btn"
                onClick={() => handleStageFile(selectedFile)}
              >
                暂存整个文件
              </button>
              <button
                className="review-panel__file-action-btn review-panel__file-action-btn--danger"
                onClick={() => handleRevertFile(selectedFile)}
              >
                还原整个文件
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Commit dialog overlay */}
      {showCommitDialog && (
        <div className="review-panel__overlay" onClick={() => setShowCommitDialog(false)}>
          <div className="review-panel__commit-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="review-panel__commit-title">提交变更</h3>
            <textarea
              className="review-panel__commit-input"
              placeholder="输入提交信息..."
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              autoFocus
              rows={4}
            />
            <div className="review-panel__commit-actions">
              <button
                className="review-panel__action-btn"
                onClick={() => setShowCommitDialog(false)}
              >
                取消
              </button>
              <button
                className="review-panel__action-btn review-panel__action-btn--primary"
                onClick={handleCommit}
                disabled={!commitMsg.trim()}
              >
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
