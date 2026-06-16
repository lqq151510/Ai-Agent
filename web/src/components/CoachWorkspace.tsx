import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  Bug,
  CheckCircle2,
  Download,
  FileArchive,
  Layers3,
  Route,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { ApiClient } from "../api";
import type {
  CoachRunResponse,
  LogDiagnosisResponse,
  RequirementBreakdownResponse,
  ScaffoldResponse,
} from "../types";
import { Card, CardContent } from "./Card";
import { BrandMark } from "./BrandMark";

interface CoachWorkspaceProps {
  api: ApiClient;
  onBack: () => void;
}

type CoachTab = "requirements" | "scaffold" | "logs";

const PRESETS = [
  { id: "spring-ai-rag-starter", label: "Spring AI RAG Starter" },
  { id: "langchain4j-agent-starter", label: "LangChain4j Agent Starter" },
  { id: "spring-boot-agent-basic", label: "Spring Boot Agent Basic" },
];

const COACH_STEPS: Array<{
  id: CoachTab;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "requirements",
    title: "需求拆解",
    description: "从一句想法生成模块、接口、风险和测试点。",
    icon: <BrainCircuit size={17} />,
  },
  {
    id: "scaffold",
    title: "项目脚手架",
    description: "生成可预览、可下载的 Java AI starter。",
    icon: <FileArchive size={17} />,
  },
  {
    id: "logs",
    title: "日志定位",
    description: "把报错压缩成根因、触发条件和验证步骤。",
    icon: <Bug size={17} />,
  },
];

import {
  BreakdownResult,
  DiagnosisResult,
  ScaffoldResult,
} from "./coach/CoachResults";

export const CoachWorkspace: React.FC<CoachWorkspaceProps> = ({
  api,
  onBack,
}) => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<CoachTab>("requirements");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<CoachRunResponse[]>([]);

  const [requirement, setRequirement] = useState(
    "做一个 Java + RAG 知识库问答系统，支持上传文档、向量检索、流式回答和回答溯源。",
  );
  const [breakdown, setBreakdown] =
    useState<RequirementBreakdownResponse | null>(null);

  const [preset, setPreset] = useState(PRESETS[0].id);
  const [projectName, setProjectName] = useState("java-rag-demo");
  const [basePackage, setBasePackage] = useState("com.example.rag");
  const [scaffold, setScaffold] = useState<ScaffoldResponse | null>(null);

  const [logContext, setLogContext] = useState(
    "Spring Boot application startup",
  );
  const [logContent, setLogContent] = useState(
    "Application failed to start because JWT_SECRET must be at least 32 characters.",
  );
  const [diagnosis, setDiagnosis] = useState<LogDiagnosisResponse | null>(null);

  useEffect(() => {
    void refreshRuns();
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "requirements" || tab === "scaffold" || tab === "logs") {
      setActiveTab(tab);
    }

    const requirementDraft = searchParams.get("requirement");
    if (requirementDraft) {
      setRequirement(requirementDraft);
    }

    const logContentDraft = searchParams.get("logContent");
    if (logContentDraft) {
      setLogContent(logContentDraft);
    }

    const logContextDraft = searchParams.get("logContext");
    if (logContextDraft) {
      setLogContext(logContextDraft);
    }

    const projectNameDraft = searchParams.get("projectName");
    if (projectNameDraft) {
      setProjectName(projectNameDraft);
    }

    const basePackageDraft = searchParams.get("basePackage");
    if (basePackageDraft) {
      setBasePackage(basePackageDraft);
    }

    const presetDraft = searchParams.get("preset");
    if (presetDraft && PRESETS.some((item) => item.id === presetDraft)) {
      setPreset(presetDraft);
    }
  }, [searchParams]);

  async function refreshRuns() {
    try {
      setRuns(await api.listCoachRuns(10));
    } catch {
      setRuns([]);
    }
  }

  async function runAction(action: () => Promise<void>) {
    setLoading(true);
    setError("");
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
      setScaffold(
        await api.createScaffold({ preset, projectName, basePackage }),
      );
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
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${name}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  function handleRunClick(run: CoachRunResponse) {
    setError("");
    try {
      if (run.runType === "REQUIREMENT_BREAKDOWN") {
        setActiveTab("requirements");
        setRequirement(run.inputText);
        const parsed = JSON.parse(run.outputJson);
        setBreakdown({
          runId: run.id,
          breakdown: parsed,
          rawText: "",
          parseWarning: null,
        });
      } else if (run.runType === "LOG_DIAGNOSIS") {
        setActiveTab("logs");
        setLogContent(run.inputText);
        setLogContext("Spring Boot Runtime");
        const parsed = JSON.parse(run.outputJson);
        setDiagnosis({
          runId: run.id,
          diagnosis: parsed,
          rawText: "",
          parseWarning: null,
        });
      } else if (run.runType === "SCAFFOLD") {
        setActiveTab("scaffold");
        if (run.inputText) {
          try {
            const req = JSON.parse(run.inputText);
            if (req.preset) setPreset(req.preset);
            if (req.projectName) setProjectName(req.projectName);
            if (req.basePackage) setBasePackage(req.basePackage);
          } catch {
            // fallback
          }
        }
        const parsed = JSON.parse(run.outputJson);
        setScaffold(parsed);
      }
    } catch (e) {
      setError(
        "无法还原该条历史记录的数据：" +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  return (
    <main className="coach-workspace panel">
      <header className="coach-hero">
        <button type="button" className="ghost coach-back" onClick={onBack}>
          <ArrowLeft size={16} />
          返回对话工作台
        </button>
        <div className="coach-hero-copy">
          <div className="coach-brand-row">
            <BrandMark className="coach-brand-mark" size={34} title={null} />
            <p className="badge">AI + Java Dev Coach</p>
          </div>
          <h1>开发陪跑器</h1>
          <p>
            把需求拆解、脚手架生成、日志定位串成一条可复盘的工程闭环，适合 AI +
            Java 学习、RAG 原型和 Agent 调试。
          </p>
        </div>
        <div className="coach-hero-metrics" aria-label="开发陪跑能力摘要">
          <div>
            <strong>3</strong>
            <span>核心流程</span>
          </div>
          <div>
            <strong>{runs.length}</strong>
            <span>最近沉淀</span>
          </div>
          <div>
            <strong>{loading ? "Run" : "Ready"}</strong>
            <span>执行状态</span>
          </div>
        </div>
      </header>

      <div className="coach-tabs" role="tablist" aria-label="开发陪跑流程">
        {COACH_STEPS.map((step) => (
          <button
            key={step.id}
            className={activeTab === step.id ? "active" : ""}
            onClick={() => setActiveTab(step.id)}
            type="button"
          >
            {step.icon}
            <span>
              <strong>{step.title}</strong>
              <small>{step.description}</small>
            </span>
          </button>
        ))}
      </div>

      {error ? <div className="coach-error">{error}</div> : null}

      <section className="coach-grid">
        <div className="coach-main">
          {activeTab === "requirements" ? (
            <Card className="coach-task-card">
              <CardContent>
                <div className="coach-card-head">
                  <div>
                    <span className="coach-step-index">01</span>
                    <h2>提问即拆解</h2>
                    <p>
                      输入一个功能想法，让系统按工程交付视角给出边界、模块、接口、风险和测试点。
                    </p>
                  </div>
                  <Route size={28} />
                </div>
                <textarea
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  rows={8}
                />
                <button
                  className="primary"
                  type="button"
                  onClick={onBreakdown}
                  disabled={loading || !requirement.trim()}
                >
                  <WandSparkles size={16} />
                  {loading ? "生成中..." : "生成拆解"}
                </button>
                {breakdown ? <BreakdownResult result={breakdown} /> : null}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "scaffold" ? (
            <Card className="coach-task-card">
              <CardContent>
                <div className="coach-card-head">
                  <div>
                    <span className="coach-step-index">02</span>
                    <h2>Java AI 项目脚手架</h2>
                    <p>
                      选择 Spring AI、LangChain4j 或基础 Agent
                      模板，生成能预览并下载的 starter。
                    </p>
                  </div>
                  <FileArchive size={28} />
                </div>
                <label>Preset</label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                >
                  {PRESETS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <label>Project Name</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
                <label>Base Package</label>
                <input
                  value={basePackage}
                  onChange={(e) => setBasePackage(e.target.value)}
                />
                <button
                  className="primary"
                  type="button"
                  onClick={onScaffold}
                  disabled={
                    loading || !projectName.trim() || !basePackage.trim()
                  }
                >
                  <FileArchive size={16} />
                  {loading ? "生成中..." : "生成预览与 ZIP"}
                </button>
                {scaffold ? (
                  <ScaffoldResult
                    result={scaffold}
                    onDownload={() => {
                      void onDownload(scaffold.runId, scaffold.projectName);
                    }}
                  />
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "logs" ? (
            <Card className="coach-task-card">
              <CardContent>
                <div className="coach-card-head">
                  <div>
                    <span className="coach-step-index">03</span>
                    <h2>日志 / 报错定位</h2>
                    <p>
                      把启动失败、模型调用异常、配置错误这类日志收敛成根因和可重复验证步骤。
                    </p>
                  </div>
                  <Bug size={28} />
                </div>
                <label>上下文</label>
                <input
                  value={logContext}
                  onChange={(e) => setLogContext(e.target.value)}
                />
                <label>日志内容</label>
                <textarea
                  value={logContent}
                  onChange={(e) => setLogContent(e.target.value)}
                  rows={10}
                />
                <button
                  className="primary"
                  type="button"
                  onClick={onDiagnose}
                  disabled={loading || !logContent.trim()}
                >
                  <Bug size={16} />
                  {loading ? "定位中..." : "定位根因"}
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
          {runs.length === 0 ? (
            <div className="coach-runs-empty">
              <Sparkles size={24} />
              <p className="muted">
                还没有开发陪跑记录。完成一次任务后，这里会形成可复盘的工程记忆。
              </p>
            </div>
          ) : null}
          {runs.map((run) => (
            <article
              key={run.id}
              className="coach-run-item"
              onClick={() => handleRunClick(run)}
              style={{ cursor: "pointer" }}
              title="点击还原并复盘该记录"
            >
              <span>
                {run.runType === "REQUIREMENT_BREAKDOWN"
                  ? "需求拆解"
                  : run.runType === "LOG_DIAGNOSIS"
                    ? "日志定位"
                    : "项目脚手架"}
              </span>
              <strong>{run.title}</strong>
              <small>{new Date(run.createdAt).toLocaleString()}</small>
            </article>
          ))}
        </aside>
      </section>
    </main>
  );
};
