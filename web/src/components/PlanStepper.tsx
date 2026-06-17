import React, { useState } from 'react';
import { Check, Clock, X } from 'lucide-react';

interface PlanStep {
  step: number;
  action: string;
  target: string;
}

export const PlanStepper = ({ planJson, taskId }: { planJson: string, taskId?: string }) => {
  const [status, setStatus] = useState<'waiting' | 'approved' | 'rejected'>('waiting');

  let steps: PlanStep[] = [];
  try {
    steps = JSON.parse(planJson);
  } catch (e) {
    return <pre>{planJson}</pre>;
  }

  const handleApprove = async () => {
    setStatus('approved');
    if (taskId) {
      try {
        await fetch(`/api/v1/agent/task/${taskId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: true })
        });
      } catch (e) {
        console.error("Error approving plan", e);
      }
    }
  };

  const handleReject = async () => {
    setStatus('rejected');
    if (taskId) {
      try {
        await fetch(`/api/v1/agent/task/${taskId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: false })
        });
      } catch (e) {
        console.error("Error rejecting plan", e);
      }
    }
  };

  return (
    <div className="plan-stepper" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#f8fafc', marginTop: '12px' }}>
      <h4 style={{ margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
        <Clock size={16} /> 执行计划确认 (Plan-and-Solve)
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {steps.map(s => (
          <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>
              {s.step}
            </div>
            <div>
              <strong style={{ color: '#1e293b' }}>{s.action}</strong>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{s.target}</div>
            </div>
          </div>
        ))}
      </div>
      
      {status === 'waiting' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleApprove} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: 'white', padding: '6px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
            <Check size={16} /> 同意并执行
          </button>
          <button onClick={handleReject} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ef4444', color: 'white', padding: '6px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
            <X size={16} /> 拒绝并重写
          </button>
        </div>
      )}
      {status === 'approved' && (
        <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 500 }}>
          <Check size={16} /> 计划已批准，正在触发后续执行...
        </div>
      )}
      {status === 'rejected' && (
        <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 500 }}>
          <X size={16} /> 计划已拒绝，任务已终止。
        </div>
      )}
    </div>
  );
};
