export type SessionTaskType = "chat" | "requirements" | "scaffold" | "logs";
export type SessionTaskStatus = "planned" | "in_progress" | "blocked" | "done";

export interface TaskModeDefinition {
  type: SessionTaskType;
  label: string;
  shortLabel: string;
  goal: string;
  title: string;
  promptTemplate: string;
  coachTab?: "requirements" | "scaffold" | "logs";
}

export const TASK_MODE_DEFINITIONS: TaskModeDefinition[] = [
  {
    type: "chat",
    label: "自由对话",
    shortLabel: "对话",
    goal: "推进当前开发任务",
    title: "开发对话",
    promptTemplate:
      "请先基于当前项目上下文给我一个简短状态判断，然后给出下一步建议。",
  },
  {
    type: "requirements",
    label: "需求拆解",
    shortLabel: "拆需求",
    goal: "拆解一个新功能需求",
    title: "需求拆解",
    promptTemplate:
      "我想做这样一个功能，请按 目标 / 模块 / API / 风险 / 测试点 拆解：",
    coachTab: "requirements",
  },
  {
    type: "scaffold",
    label: "脚手架生成",
    shortLabel: "脚手架",
    goal: "生成可运行的项目脚手架",
    title: "脚手架生成",
    promptTemplate:
      "帮我生成这个项目的 starter 方案，至少说明技术栈、模块结构、启动步骤：",
    coachTab: "scaffold",
  },
  {
    type: "logs",
    label: "报错定位",
    shortLabel: "排报错",
    goal: "定位并修复一个报错",
    title: "报错定位",
    promptTemplate:
      "下面是报错日志，请按 现象 / 根因 / 最小修复 / 验证步骤 分析：",
    coachTab: "logs",
  },
];

export function getTaskModeDefinition(
  type?: string | null,
): TaskModeDefinition {
  return (
    TASK_MODE_DEFINITIONS.find((item) => item.type === type) ??
    TASK_MODE_DEFINITIONS[0]
  );
}

export function getTaskStatusLabel(status?: string | null): string {
  switch (status) {
    case "in_progress":
      return "进行中";
    case "blocked":
      return "卡住了";
    case "done":
      return "已完成";
    case "planned":
    default:
      return "待开始";
  }
}
