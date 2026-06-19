import { useState, useEffect } from 'react';

type SkillDetailProps = {
  name: string;
  onClose: () => void;
};

export function SkillDetail({ name, onClose }: SkillDetailProps) {
  const [skill, setSkill] = useState<any>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    loadSkill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const loadSkill = async () => {
    setLoading(true);
    try {
      const s = await window.electronAPI?.skill?.get(name);
      setSkill(s);
      const instr = await window.electronAPI?.skill?.read(name);
      setInstructions(instr);
    } catch {
      setSkill(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="skill-detail__loading">加载中...</div>;
  if (!skill) return <div className="skill-detail__error">技能 "{name}" 未找到</div>;

  return (
    <div className="skill-detail">
      <div className="skill-detail__header">
        <span className="skill-detail__name">{skill.name}</span>
        <span className={`skill-detail__source skill-detail__source--${skill.source}`}>
          {skill.source === 'global' ? '全局' : skill.source === 'project' ? '项目' : '工作区'}
        </span>
        <button className="skill-detail__close" onClick={onClose}>✕</button>
      </div>

      <div className="skill-detail__body">
        <p className="skill-detail__desc">{skill.description}</p>

        {skill.version && (
          <div className="skill-detail__meta">
            <span className="skill-detail__label">版本:</span> {skill.version}
          </div>
        )}
        {skill.author && (
          <div className="skill-detail__meta">
            <span className="skill-detail__label">作者:</span> {skill.author}
          </div>
        )}

        {skill.tags?.length > 0 && (
          <div className="skill-detail__tags">
            {skill.tags.map((tag: string) => (
              <span key={tag} className="skill-detail__tag">{tag}</span>
            ))}
          </div>
        )}

        {skill.triggers?.length > 0 && (
          <div className="skill-detail__triggers">
            <span className="skill-detail__label">触发词:</span>
            {skill.triggers.map((t: string) => (
              <code key={t} className="skill-detail__trigger">{t}</code>
            ))}
          </div>
        )}

        {skill.tools?.length > 0 && (
          <div className="skill-detail__tools-section">
            <span className="skill-detail__label">注册的工具 ({skill.tools.length})</span>
            {skill.tools.map((tool: any) => (
              <div key={tool.name} className="skill-detail__tool">
                <code className="skill-detail__tool-name">{tool.name}</code>
                <span className="skill-detail__tool-desc">{tool.description}</span>
              </div>
            ))}
          </div>
        )}

        {skill.hasScripts && (
          <div className="skill-detail__notice">📁 此技能包含可执行脚本</div>
        )}

        {instructions && (
          <div className="skill-detail__instructions">
            <button
              className="skill-detail__toggle-btn"
              onClick={() => setShowInstructions(v => !v)}
            >
              {showInstructions ? '收起指令' : '查看指令'}
            </button>
            {showInstructions && (
              <pre className="skill-detail__instructions-body">{instructions}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
