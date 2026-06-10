import React from 'react';
import { Bot, Sparkles, Plus } from 'lucide-react';

export const UserAgentsPanel: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>Agent 管理</h1>
          <p style={{ color: 'var(--text-muted)' }}>配置与管理您的自定义智能体 (Custom Agents)</p>
        </div>
        <button className="primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} disabled>
          <Plus size={16} /> 创建新 Agent
        </button>
      </div>

      <div className="panel" style={{ padding: '40px', borderRadius: '8px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: 'var(--accent-color)' }}>
          <Bot size={48} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>多智能体特性即将上线</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
          在接下来的版本中，我们将支持“创建自定义 Agent”功能。您可以为每个 Agent 配置独立的人设 (System Prompt)、选择可使用的工具集 (Tools) 并限定专属的大模型，满足各种定制化办公和开发需求！
        </p>
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '6px 12px' }}>
            <Sparkles size={14} /> 敬请期待
          </span>
        </div>
      </div>
    </div>
  );
};
