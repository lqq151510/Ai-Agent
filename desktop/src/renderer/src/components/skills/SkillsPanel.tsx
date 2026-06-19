import { useState, useEffect, useCallback } from 'react';
import { SkillDetail } from './SkillDetail';
import './skills.css';

type SkillEntry = {
  name: string;
  description: string;
  version?: string;
  author?: string;
  triggers: string[];
  tags: string[];
  source: 'global' | 'project' | 'workspace';
};

type SkillsPanelProps = {
  onClose?: () => void;
};

/**
 * Skills browser panel — list, search, view, install skills.
 */
export function SkillsPanel({ onClose }: SkillsPanelProps) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detailName, setDetailName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'global' | 'project'>('all');

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      await window.electronAPI?.skill?.discover();
      const list = await window.electronAPI?.skill?.list();
      setSkills(Array.isArray(list) ? list : []);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Filter by search + tab
  const filtered = skills.filter(s => {
    if (activeTab !== 'all' && s.source !== activeTab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q))
    );
  });

  const groupedSource: Record<string, SkillEntry[]> = {};
  for (const s of filtered) {
    const key = s.source === 'global' ? '全局技能' : s.source === 'project' ? '项目技能' : '工作区技能';
    if (!groupedSource[key]) groupedSource[key] = [];
    groupedSource[key].push(s);
  }

  if (detailName) {
    return (
      <SkillDetail
        name={detailName}
        onClose={() => setDetailName(null)}
      />
    );
  }

  return (
    <div className="skills-panel">
      {/* Header */}
      <div className="skills-panel__header">
        <span className="skills-panel__title">技能</span>
        <div className="skills-panel__actions">
          <button className="skills-panel__refresh-btn" onClick={loadSkills} title="重新扫描">
            ↻
          </button>
          {onClose && (
            <button className="skills-panel__close-btn" onClick={onClose}>✕</button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="skills-panel__search">
        <input
          type="text"
          className="skills-panel__search-input"
          placeholder="搜索技能名称、描述、标签..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Source tabs */}
      <div className="skills-panel__tabs">
        {(['all', 'global', 'project'] as const).map(tab => (
          <button
            key={tab}
            className={`skills-panel__tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'all' ? '全部' : tab === 'global' ? '全局' : '项目'}
          </button>
        ))}
      </div>

      {/* Skill list */}
      <div className="skills-panel__list">
        {loading && <div className="skills-panel__placeholder">扫描中...</div>}
        {!loading && filtered.length === 0 && (
          <div className="skills-panel__placeholder">
            {skills.length === 0 ? '没有发现技能' : '没有匹配的技能'}
          </div>
        )}

        {Object.entries(groupedSource).map(([group, items]) => (
          <div key={group}>
            <div className="skills-panel__group-label">{group} ({items.length})</div>
            {items.map(s => (
              <div
                key={s.name}
                className="skills-panel__card"
                onClick={() => setDetailName(s.name)}
              >
                <div className="skills-panel__card-header">
                  <span className="skills-panel__card-name">{s.name}</span>
                  <span className={`skills-panel__card-badge skills-panel__card-badge--${s.source}`}>
                    {s.source === 'global' ? 'G' : s.source === 'project' ? 'P' : 'W'}
                  </span>
                </div>
                <p className="skills-panel__card-desc">{s.description}</p>
                <div className="skills-panel__card-meta">
                  {s.triggers?.length > 0 && (
                    <span className="skills-panel__card-triggers">
                      触发: {s.triggers.slice(0, 3).join(', ')}
                    </span>
                  )}
                  {s.tags?.length > 0 && (
                    <span className="skills-panel__card-tags">
                      {s.tags.slice(0, 3).map(t => `#${t}`).join(' ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
