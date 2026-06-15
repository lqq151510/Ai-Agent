import React, { useState, useMemo } from 'react';
import { MemoryItem } from '../types';
import { Brain, Trash2, Edit3, Save, X, Search, Sparkles, Database, ShieldAlert, Check } from 'lucide-react';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
  loading: boolean;
  onUpdateMemory: (id: string, text: string) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  memories,
  loading,
  onUpdateMemory,
  onDeleteMemory
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    const q = searchQuery.toLowerCase();
    return memories.filter(item => 
      item.text.toLowerCase().includes(q) || 
      item.metadata.toLowerCase().includes(q)
    );
  }, [memories, searchQuery]);

  if (!isOpen) return null;

  const handleStartEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const handleSave = async (id: string) => {
    if (!editText.trim()) return;
    setActionLoadingId(id);
    try {
      await onUpdateMemory(id, editText.trim());
      setEditingId(null);
      setSuccessId(id);
      setTimeout(() => setSuccessId(null), 2000);
    } catch (err) {
      alert('保存记忆失败，请重试');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要让 Agent 遗忘这段记忆吗？此操作不可逆。')) return;
    setActionLoadingId(id);
    try {
      await onDeleteMemory(id);
    } catch (err) {
      alert('遗忘记忆失败，请重试');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Helper to prettify metadata JSON for display
  const formatMetadata = (metaStr: string) => {
    try {
      const parsed = JSON.parse(metaStr);
      if (parsed.runId) {
        return `Run ID: ${parsed.runId.slice(0, 8)}...`;
      }
      if (parsed.filename) {
        return `File: ${parsed.filename}`;
      }
      return Object.entries(parsed)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
    } catch {
      return metaStr;
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="memory-modal animate-scale">
        <header className="memory-modal-header">
          <div className="header-title">
            <div className="icon-badge glow-primary">
              <Brain className="animate-pulse-slow text-primary" size={20} />
            </div>
            <div>
              <h3>Agent 记忆胶囊库</h3>
              <p className="subtitle">
                直观管理 Agent 学习到的事实、规则和诊断上下文。手动调整能有效减少幻觉。
              </p>
            </div>
          </div>
          <button className="close-btn ghost" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="memory-modal-search">
          <div className="search-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="搜索记忆文本、特征或元数据标签..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery('')}>
                清除
              </button>
            )}
          </div>
          <div className="memory-count">
            <Database size={13} />
            <span>已装载 {memories.length} 条核心 RAG 记忆</span>
          </div>
        </div>

        <div className="memory-modal-body">
          {loading ? (
            <div className="memory-loading">
              <div className="glow-spinner" />
              <p>读取记忆向量数据中...</p>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="memory-empty-state">
              <div className="empty-icon-capsule">
                <Sparkles size={32} />
              </div>
              <h4>未检索到相关记忆</h4>
              <p>
                {searchQuery 
                  ? '尝试换些简短的关键词，或清除搜索框。' 
                  : '当 Agent 协助您诊断出问题成因并给出修复方案后，会自动将其压缩并沉淀在此处。'}
              </p>
            </div>
          ) : (
            <div className="memory-list">
              {filteredMemories.map(item => {
                const isEditing = editingId === item.id;
                const isActionLoading = actionLoadingId === item.id;
                const isSuccess = successId === item.id;

                return (
                  <div key={item.id} className={`memory-card ${isEditing ? 'editing' : ''} ${isSuccess ? 'success-glow' : ''}`}>
                    <div className="memory-card-header">
                      <span className="metadata-tag">
                        <Database size={11} />
                        {formatMetadata(item.metadata)}
                      </span>
                      {isSuccess && (
                        <span className="success-badge">
                          <Check size={12} /> 已同步向量
                        </span>
                      )}
                    </div>

                    <div className="memory-card-content">
                      {isEditing ? (
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows={4}
                          disabled={isActionLoading}
                          className="memory-textarea"
                          placeholder="微调此段事实或规则，AI 会根据新文本重新计算 Embedding 向量..."
                        />
                      ) : (
                        <p className="memory-text-display">{item.text}</p>
                      )}
                    </div>

                    <div className="memory-card-actions">
                      {isEditing ? (
                        <>
                          <button
                            className="secondary text-sm btn-sm"
                            onClick={() => setEditingId(null)}
                            disabled={isActionLoading}
                          >
                            取消
                          </button>
                          <button
                            className="primary text-sm btn-sm"
                            onClick={() => handleSave(item.id)}
                            disabled={isActionLoading || !editText.trim()}
                          >
                            {isActionLoading ? '计算嵌入中...' : (
                              <>
                                <Save size={13} />
                                保存微调
                              </>
                            )}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="ghost text-sm btn-sm delete-action"
                            onClick={() => handleDelete(item.id)}
                            disabled={isActionLoading}
                            title="从向量库永久删除此段记忆，使其失效"
                          >
                            <Trash2 size={13} />
                            遗忘
                          </button>
                          <button
                            className="ghost text-sm btn-sm edit-action"
                            onClick={() => handleStartEdit(item)}
                            disabled={isActionLoading}
                          >
                            <Edit3 size={13} />
                            微调
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <footer className="memory-modal-footer">
          <ShieldAlert size={14} className="text-amber" />
          <span className="muted text-xs">
            警告：直接修改事实数据会迫使 Embedding 重新训练（秒级），微调后大模型在下一次相似度检索时将按新内容回答。
          </span>
        </footer>
      </div>
    </div>
  );
};
