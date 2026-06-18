import { useState, useEffect, useCallback } from 'react';

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

interface ContextPanelProps {
  workspacePath: string | null;
  onSelectWorkspace: (path: string) => void;
  selectedFiles: string[];
  onToggleFile: (path: string) => void;
}

const LOCAL_SERVICE_URL = 'http://127.0.0.1:8765';

export function ContextPanel({
  workspacePath, onSelectWorkspace, selectedFiles, onToggleFile
}: ContextPanelProps) {
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [serviceReady, setServiceReady] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Check if local-service is available
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${LOCAL_SERVICE_URL}/health`);
        setServiceReady(r.ok);
      } catch {
        setServiceReady(false);
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load file tree when workspace changes
  useEffect(() => {
    if (!workspacePath || !serviceReady) return;
    setLoadingTree(true);
    fetch(`${LOCAL_SERVICE_URL}/workspace/tree?path=${encodeURIComponent(workspacePath)}&depth=2`)
      .then(r => r.json())
      .then((data: { tree: FileTreeNode[] }) => {
        setFileTree(data.tree || []);
      })
      .catch(() => setFileTree([]))
      .finally(() => setLoadingTree(false));
  }, [workspacePath, serviceReady]);

  const handleSelectWorkspace = async () => {
    const path = await window.electronAPI?.invoke('workspace:add');
    if (path) {
      onSelectWorkspace(path.path ?? path);
    }
  };

  const toggleDir = useCallback((dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  function renderTree(nodes: FileTreeNode[], depth = 0): React.ReactNode {
    return nodes.map(node => {
      const indent = depth * 12;
      if (node.type === 'directory') {
        const isOpen = expandedDirs.has(node.path);
        return (
          <div key={node.path}>
            <div
              className="file-tree__dir"
              style={{ paddingLeft: indent }}
              onClick={() => toggleDir(node.path)}
              id={`dir-${node.path.replace(/[^a-zA-Z0-9]/g, '_')}`}
            >
              <span className="file-tree__dir-icon">{isOpen ? '▾' : '▸'}</span>
              <span className="file-tree__dir-name">{node.name}</span>
            </div>
            {isOpen && node.children && renderTree(node.children, depth + 1)}
          </div>
        );
      }
      const isSelected = selectedFiles.includes(node.path);
      return (
        <div
          key={node.path}
          className={`file-tree__file${isSelected ? ' file-tree__file--selected' : ''}`}
          style={{ paddingLeft: indent + 16 }}
          onClick={() => onToggleFile(node.path)}
          title={node.path}
          id={`file-${node.path.replace(/[^a-zA-Z0-9]/g, '_')}`}
        >
          <span className="file-tree__file-check">{isSelected ? '✓' : '○'}</span>
          <span className="file-tree__file-name">{node.name}</span>
        </div>
      );
    });
  }

  return (
    <div className="context-panel">
      <div className="context-panel__header">
        <span className="context-panel__title">上下文</span>
        <div
          className={`context-panel__service-dot${serviceReady ? ' context-panel__service-dot--ok' : ''}`}
          title={serviceReady ? 'local-service 运行中' : 'local-service 未启动'}
        />
      </div>

      {/* Workspace Selector */}
      <div className="context-panel__workspace">
        <div className="context-panel__workspace-path" title={workspacePath ?? ''}>
          {workspacePath
            ? workspacePath.split('/').slice(-2).join('/')
            : '未选择工作区'}
        </div>
        <button
          id="btn-select-workspace"
          className="context-panel__workspace-btn"
          onClick={handleSelectWorkspace}
        >
          选择目录
        </button>
      </div>

      {/* File Tree */}
      <div className="context-panel__tree-header">
        文件
        {selectedFiles.length > 0 && (
          <span className="context-panel__selected-count"> ({selectedFiles.length} 已选)</span>
        )}
      </div>
      <div className="context-panel__tree" id="workspace-file-tree">
        {!workspacePath && (
          <div className="context-panel__hint">选择工作区目录后显示文件树</div>
        )}
        {workspacePath && !serviceReady && (
          <div className="context-panel__hint context-panel__hint--warn">
            ⚠ local-service 未就绪 (localhost:8765)
          </div>
        )}
        {loadingTree && (
          <div className="context-panel__hint">加载中…</div>
        )}
        {!loadingTree && workspacePath && serviceReady && fileTree.length === 0 && (
          <div className="context-panel__hint">目录为空</div>
        )}
        {renderTree(fileTree)}
      </div>

      {/* Selected files chips */}
      {selectedFiles.length > 0 && (
        <div className="context-panel__chips">
          {selectedFiles.map(fp => (
            <div
              key={fp}
              className="context-panel__chip"
              onClick={() => onToggleFile(fp)}
              title={fp}
            >
              <span>{fp.split('/').pop()}</span>
              <span className="context-panel__chip-remove">×</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
