import React, { useEffect, useState } from 'react';
import { ArrowLeft, BrainCircuit, Bug, Download, FileArchive, Layers3, WandSparkles } from 'lucide-react';
import type { ApiClient } from '../api';
import type { CoachRunResponse, LogDiagnosisResponse, RequirementBreakdownResponse, ScaffoldResponse } from '../types';
import { Card, CardContent } from './Card';

interface CoachWorkspaceProps {
  api: ApiClient;
  onBack: () => void;
}

type CoachTab = 'requirements' | 'scaffold' | 'logs';

const PRESETS = [
  { id: 'spring-ai-rag-starter', label: 'Spring AI RAG Starter' },
  { id: 'langchain4j-agent-starter', label: 'LangChain4j Agent Starter' },
  { id: 'spring-boot-agent-basic', label: 'Spring Boot Agent Basic' }
];

export const CoachWorkspace: React.FC<CoachWorkspaceProps> = ({ api, onBack }) => {
  const [activeTab, setActiveTab] = useState<CoachTab>('requirements');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState<CoachRunResponse[]>([]);

  const [requirement, setRequirement] = useState('做一个 Java + RAG 知识库问答系统，支持上传文档、向量检索、流式回答和回答溯源。');
  const [breakdown, setBreakdown] = useState<RequirementBreakdownResponse | null>(null);

  const [preset, setPreset] = useState(PRESETS[0].id);
  const [projectName, setProjectName] = useState('java-rag-demo');
  const [basePackage, setBasePackage] = useState('com.example.rag');
  const [scaffold, setScaffold] = useState<ScaffoldResponse | null>(null);

  const [logContext, setLogContext] = useState('Spring Boot application startup');
  const [logContent, setLogContent] = useState('Application failed to start because JWT_SECRET must be at least 32 characters.');
  const [diagnosis, setDiagnosis] = useState<LogDiagnosisResponse | null>(null);

  useEffect(() => {
    void refreshRuns();
  }, []);

  async function refreshRuns() {
    try {
      setRuns(await api.listCoachRuns(10));
    } catch {
      setRuns([]);
    }
  }

  async function runAction(action: () => Promise<void>) {
    setLoading(true);
    setError('');
    try {
      await action();
      await refreshRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onBreakdown() {
    await runAction(async () => {
      setBreakdown(await api.breakdownRequirement({ requirement }));
    });
  }

  async function onScaffold() {
    await runAction(async () => {
      setScaffold(await api.createScaffold({ preset, projectName, basePackage }));
    });
  }

  async function onDiagnose() {
    await runAction(async () => {
      setDiagnosis(await api.diagnoseLog({ logContent, context: logContext }));
    });
  }

  async function onDownload(runId: string, name: string) {
    await runAction(async () => {
      const blob = await api.downloadScaffold(runId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${name}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <main className="coach-workspace panel">
      <header className="coach-hero">
        <button type="button" className="ghost coach-back" onClick={onBack}>
          <ArrowLeft size={16} />
          返回对话工作台
        </button>
        <div>
          <p className="badge">AI + Java Dev Coach</p>
          <h1>开发陪跑器</h1>
          <p>把需求拆解、脚手架生成、日志定位串成一条可复盘的工程闭环。</p>
        </div>
      </header>

      <div className="coach-tabs">
        <button className={activeTab === 'requirements' ? 'active' : ''} onClick={() => setActiveTab('requirements')} type="button">
          <BrainCircuit size={16} />
          需求拆解
        </button>
        <button className={activeTab === 'scaffold' ? 'active' : ''} onClick={() => setActiveTab('scaffold')} type="button">
          <FileArchive size={16} />
          项目脚手架
        </button>
        <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')} type="button">
          <Bug size={16} />
          日志定位
        </button>
      </div>

      {error ? <div className="coach-error">{error}</div> : null}

      <section className="coach-grid">
        <div className="coach-main">
          {activeTab === 'requirements' ? (
            <Card>
              <CardContent>
                <h2>提问即拆解</h2>
                <textarea value={requirement} onChange={e => setRequirement(e.target.value)} rows={8} />
                <button className="primary" type="button" onClick={onBreakdown} disabled={loading || !requirement.trim()}>
                  <WandSparkles size={16} />
                  生成拆解
                </button>
                {breakdown ? <BreakdownResult result={breakdown} /> : null}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === 'scaffold' ? (
            <Card>
              <CardContent>
                <h2>Java AI 项目脚手架</h2>
                <label>Preset</label>
                <select value={preset} onChange={e => setPreset(e.target.value)}>
                  {PRESETS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <label>Project Name</label>
                <input value={projectName} onChange={e => setProjectName(e.target.value)} />
                <label>Base Package</label>
                <input value={basePackage} onChange={e => setBasePackage(e.target.value)} />
                <button className="primary" type="button" onClick={onScaffold} disabled={loading || !projectName.trim() || !basePackage.trim()}>
                  <FileArchive size={16} />
                  生成预览与 ZIP
                </button>
                {scaffold ? (
                  <ScaffoldResult
                    result={scaffold}
                    onDownload={() => { void onDownload(scaffold.runId, scaffold.projectName); }}
                  />
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === 'logs' ? (
            <Card>
              <CardContent>
                <h2>日志 / 报错定位</h2>
                <label>上下文</label>
                <input value={logContext} onChange={e => setLogContext(e.target.value)} />
                <label>日志内容</label>
                <textarea value={logContent} onChange={e => setLogContent(e.target.value)} rows={10} />
                <button className="primary" type="button" onClick={onDiagnose} disabled={loading || !logContent.trim()}>
                  <Bug size={16} />
                  定位根因
                </button>
                {diagnosis ? <DiagnosisResult result={diagnosis} /> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="coach-runs">
          <div className="section-heading">
            <Layers3 size={16} />
            <h3>最近沉淀</h3>
          </div>
          {runs.length === 0 ? <p className="muted">还没有开发陪跑记录。</p> : null}
          {runs.map(run => (
            <article key={run.id} className="coach-run-item">
              <span>{run.runType}</span>
              <strong>{run.title}</strong>
              <small>{new Date(run.createdAt).toLocaleString()}</small>
            </article>
          ))}
        </aside>
      </section>
    </main>
  );
};

const BreakdownResult: React.FC<{ result: RequirementBreakdownResponse }> = ({ result }) => (
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

const DiagnosisResult: React.FC<{ result: LogDiagnosisResponse }> = ({ result }) => (
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

const ScaffoldResult: React.FC<{ result: ScaffoldResponse; onDownload: () => void }> = ({ result, onDownload }) => (
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

const ResultList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <div className="result-list">
    <h4>{title}</h4>
    {items.length === 0 ? <p className="muted">暂无内容</p> : null}
    <ul>
      {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
    </ul>
  </div>
);
