interface PlanApprovalDialogProps {
  planJson: string;
  onApprove: () => void;
  onReject: () => void;
}

type PlanStep = {
  step?: string | number;
  action?: string;
  target?: string;
};

export function PlanApprovalDialog({
  planJson,
  onApprove,
  onReject,
}: PlanApprovalDialogProps) {
  let steps: PlanStep[] = [];
  try {
    const parsed = JSON.parse(planJson);
    if (Array.isArray(parsed)) {
      steps = parsed;
    }
  } catch {
    // Fallback to raw plan text.
  }

  return (
    <div className="plan-approval">
      <div className="plan-approval__backdrop" />
      <div className="plan-approval__dialog">
        <div className="plan-approval__label">Plan-and-Solve</div>
        <h3 className="plan-approval__title">检测到执行计划，等待审批</h3>
        <div className="plan-approval__body">
          {steps.length > 0 ? (
            steps.map((step, index) => (
              <div key={`${step.step ?? index}-${step.target ?? ''}`} className="plan-approval__step">
                <span className="plan-approval__step-index">[{step.step ?? index + 1}]</span>
                <span className="plan-approval__step-action">{step.action ?? 'Step'}</span>
                {step.target ? (
                  <span className="plan-approval__step-target"> {step.target}</span>
                ) : null}
              </div>
            ))
          ) : (
            <pre className="plan-approval__raw">{planJson}</pre>
          )}
        </div>
        <div className="plan-approval__actions">
          <button className="plan-approval__btn plan-approval__btn--ghost" onClick={onReject}>
            拒绝
          </button>
          <button className="plan-approval__btn plan-approval__btn--primary" onClick={onApprove}>
            同意并执行
          </button>
        </div>
      </div>
    </div>
  );
}
