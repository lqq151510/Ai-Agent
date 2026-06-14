import React from 'react';
import { CheckCircle2, Download } from 'lucide-react';
import type { LogDiagnosisResponse, RequirementBreakdownResponse, ScaffoldResponse } from '../../types';

export const ResultList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <div className="result-list">
    <h4><CheckCircle2 size={14} />{title}</h4>
    {items.length === 0 ? <p className="muted">暂无内容</p> : null}
    <ul>
      {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
    </ul>
  </div>
);

export const BreakdownResult: React.FC<{ result: RequirementBreakdownResponse }> = ({ result }) => (
  <div className="coach-result">
    {result.parseWarning ? <p className="coach-warning">{result.parseWarning}</p> : null}
    <h3>{result.breakdown.goal}</h3>
    <ResultList title="模块" items={result.breakdown.modules.map(item => `${item.name}: ${item.description}`)} />
    <ResultList title="数据结构" items={result.breakdown.dataStructures.map(item => `${item.name}: ${item.description}`)} />
    <ResultList title="接口" items={result.breakdown.apiEndpoints.map(item => `${item.method} ${item.path} - ${item.purpose}`)} />
    <ResultList title="风险" items={result.breakdown.risks.map(item => `${item.name}: ${item.description}`)} />
    <ResultList title="测试点" items={result.breakdown.testPoints} />
  </div>
);

export const DiagnosisResult: React.FC<{ result: LogDiagnosisResponse }> = ({ result }) => (
  <div className="coach-result">
    {result.parseWarning ? <p className="coach-warning">{result.parseWarning}</p> : null}
    <ResultList title="定位结论" items={[
      `现象: ${result.diagnosis.symptom}`,
      `根因: ${result.diagnosis.rootCause}`,
      `触发条件: ${result.diagnosis.triggerCondition}`,
      `最小修复: ${result.diagnosis.minimalFix}`
    ]} />
    <ResultList title="验证步骤" items={result.diagnosis.verificationSteps} />
  </div>
);

export const ScaffoldResult: React.FC<{ result: ScaffoldResponse; onDownload: () => void }> = ({ result, onDownload }) => (
  <div className="coach-result">
    <div className="scaffold-head">
      <h3>{result.projectName}</h3>
      <button className="primary" type="button" onClick={onDownload}>
        <Download size={16} />
        下载 ZIP
      </button>
    </div>
    <ResultList title="启动命令" items={result.startCommands} />
    <ResultList title="文件树" items={result.fileTree} />
    <div className="preview-stack">
      {result.previews.map(file => (
        <details key={file.path} open={file.path === 'README.md'}>
          <summary>{file.path}</summary>
          <pre>{file.content}</pre>
        </details>
      ))}
    </div>
  </div>
);
