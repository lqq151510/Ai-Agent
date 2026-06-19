// --------------- Types ---------------

export type DiffLineType = 'add' | 'del' | 'ctx';

export type DiffLine = {
  type: DiffLineType;
  oldLineNo: number | null;
  newLineNo: number | null;
  content: string;
};

export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
};

export type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied';

export type StructuredDiff = {
  file: string;
  oldFile?: string; // for renames
  status: FileStatus;
  hunks: DiffHunk[];
};

export type DiffStat = {
  additions: number;
  deletions: number;
};

// --------------- Parser ---------------

/**
 * Parse unified `git diff` output into structured data.
 *
 * Handles:
 * - Standard modified files
 * - New files (--- /dev/null)
 * - Deleted files (+++ /dev/null)
 * - Renamed files (diff --git a/... b/... with rename from/to)
 * - Binary files (skip)
 * - No-trailing-newline markers (ignore)
 */
export function parseUnifiedDiff(raw: string): StructuredDiff[] {
  if (!raw || !raw.trim()) return [];

  const results: StructuredDiff[] = [];
  let current: StructuredDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineOffset = 0;
  let newLineOffset = 0;

  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file marker: diff --git a/path b/path
    if (line.startsWith('diff --git ')) {
      // Save previous
      if (current) {
        if (currentHunk) {
          current.hunks.push(currentHunk);
          currentHunk = null;
        }
        results.push(current);
      }

      const parts = line.replace('diff --git ', '').split(/\s+/);
      const oldPath = parts[0]?.replace(/^a\//, '') ?? '';
      const newPath = parts[1]?.replace(/^b\//, '') ?? '';

      current = {
        file: newPath || oldPath,
        oldFile: oldPath !== newPath ? oldPath : undefined,
        status: 'modified',
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    if (!current) continue;

    // Rename detection
    if (line.startsWith('rename from ')) {
      current.status = 'renamed';
      current.oldFile = line.replace('rename from ', '');
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.file = line.replace('rename to ', '');
      continue;
    }

    // New file
    if (line === 'new file mode' || line.startsWith('new file mode ')) {
      current.status = 'added';
      continue;
    }

    // Deleted file
    if (line === 'deleted file mode' || line.startsWith('deleted file mode ')) {
      current.status = 'deleted';
      continue;
    }

    // Binary files
    if (line.startsWith('Binary files ') || line === '-- ' + 'a/' && false) {
      continue; // skip binary
    }

    // Index line — skip
    if (line.startsWith('index ')) continue;

    // --- a/path
    if (line.startsWith('--- ')) continue;

    // +++ b/path
    if (line.startsWith('+++ ')) continue;

    // No newline at end of file — skip
    if (line.startsWith('\\ No newline at end of file')) {
      // Optionally mark the last line
      continue;
    }

    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      if (currentHunk) {
        current.hunks.push(currentHunk);
      }

      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newLines: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
        header: line,
        lines: [],
      };
      oldLineOffset = currentHunk.oldStart;
      newLineOffset = currentHunk.newStart;
      continue;
    }

    // Content line
    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        oldLineNo: null,
        newLineNo: newLineOffset,
        content: line.substring(1),
      });
      newLineOffset++;
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'del',
        oldLineNo: oldLineOffset,
        newLineNo: null,
        content: line.substring(1),
      });
      oldLineOffset++;
    } else {
      // Context line (starts with space or empty)
      currentHunk.lines.push({
        type: 'ctx',
        oldLineNo: oldLineOffset,
        newLineNo: newLineOffset,
        content: line.startsWith(' ') ? line.substring(1) : line,
      });
      oldLineOffset++;
      newLineOffset++;
    }
  }

  // Push last hunk
  if (currentHunk && current) {
    current.hunks.push(currentHunk);
  }

  // Push last file
  if (current) {
    results.push(current);
  }

  return results;
}

/**
 * Compute addition/deletion stats from structured diff.
 */
export function computeDiffStats(diffs: StructuredDiff[]): DiffStat {
  let additions = 0;
  let deletions = 0;
  for (const d of diffs) {
    for (const hunk of d.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') additions++;
        if (line.type === 'del') deletions++;
      }
    }
  }
  return { additions, deletions };
}

/**
 * Find a hunk by its starting line in the new file.
 * Useful for locating which hunk a line belongs to.
 */
export function findHunkByNewLine(diff: StructuredDiff, newLine: number): DiffHunk | null {
  for (const hunk of diff.hunks) {
    const firstNewLine = hunk.newStart;
    const lastNewLine = firstNewLine + hunk.newLines - 1;
    if (newLine >= firstNewLine && newLine <= lastNewLine) {
      return hunk;
    }
  }
  return null;
}
