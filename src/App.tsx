import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import "./styles.css";
import SessionSummaryExport from "./components/SessionSummaryExport";
import {
  useAuth,
  ProtectedButton,
  PermissionGate,
  ProtectedMenu,
  RoleSwitcher,
  UserInfoBar,
  AuditLogViewer,
  ProtectedField,
  createAuditLog,
  assertPermission,
  type PermissionAction,
} from "./auth";
import {
  loadAllData,
  saveTimelineRecord,
  deleteTimelineRecord as dbDeleteTimeline,
  saveRiskAssessment,
  deleteRiskAssessment as dbDeleteRisk,
  saveGoal,
  deleteGoal as dbDeleteGoal,
  saveCounters,
  saveCaseRecord,
  deleteCaseRecord as dbDeleteCaseRecord,
  saveCrisisWarning,
  deleteCrisisWarning as dbDeleteCrisisWarning,
  getDBStatus,
  addDBListener,
  resetToSampleData,
  checkDBSupport,
  type AppData,
  type DBStatus,
  type DBEventType,
} from "./db";

const project = {
  "id": "hxwl-12",
  "port": 5112,
  "title": "心理咨询个案记录",
  "subtitle": "会谈时间线、风险等级与干预目标记录",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#7c3aed",
    "#0f766e",
    "#f59e0b"
  ],
  "domain": "心理咨询",
  "users": [
    "咨询师",
    "督导",
    "机构管理员"
  ],
  "metrics": [
    "活跃个案",
    "高风险关注",
    "本周会谈",
    "目标推进"
  ],
  "filters": [
    "焦虑",
    "亲密关系",
    "亲子",
    "职业压力"
  ],
  "fields": [
    "来访者代号",
    "咨询主题",
    "会谈日期",
    "主要困扰",
    "情绪状态",
    "干预方法",
    "下次目标"
  ],
  "records": [
    [
      "C-042",
      "焦虑",
      "中风险",
      "睡眠改善，练习呼吸放松"
    ],
    [
      "C-119",
      "亲密关系",
      "稳定",
      "识别沟通中的回避模式"
    ],
    [
      "C-203",
      "职业压力",
      "关注",
      "设定下周边界练习"
    ]
  ]
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

export interface TimelineRecord {
  id: string;
  clientCode: string;
  sessionDate: string;
  topic: string;
  emotionalState: string;
  intervention: string;
  nextGoal: string;
  eventType?: string;
}

export type RiskLevel = "stable" | "watch" | "medium" | "high";

export type GoalStatus = "active" | "paused" | "completed";

export interface InterventionGoal {
  id: string;
  clientCode: string;
  goalTitle: string;
  description: string;
  status: GoalStatus;
  totalSteps: number;
  completedSteps: number;
  lastAction: string;
  lastActionDate: string;
  nextPractice: string;
  nextPracticeDate: string;
  createdAt: string;
}

export interface RiskDimensions {
  sleep: number;
  emotion: number;
  selfHarm: number;
  support: number;
  stress: number;
}

export interface RiskAssessment {
  id: string;
  clientCode: string;
  assessDate: string;
  dimensions: RiskDimensions;
  totalScore: number;
  level: RiskLevel;
  summary: string;
}

export type CrisisWarningStatus = "pending" | "confirmed" | "escalated" | "referred" | "closed";

export interface CrisisWarningAction {
  id: string;
  fromStatus: CrisisWarningStatus;
  toStatus: CrisisWarningStatus;
  handler: string;
  handledAt: string;
  description: string;
}

export interface CrisisWarning {
  id: string;
  clientCode: string;
  triggerType: "risk_assessment" | "case_record";
  triggerId: string;
  triggerReason: string;
  status: CrisisWarningStatus;
  createdAt: string;
  updatedAt: string;
  actions: CrisisWarningAction[];
}

export interface CaseRecord {
  id: string;
  clientCode: string;
  consultationTopic: string;
  sessionDate: string;
  mainConcern: string;
  emotionalState: string;
  intervention: string;
  nextGoal: string;
  createdAt: string;
  updatedAt: string;
}

export type SupervisionStatus = "draft" | "pending" | "feedback";

export interface SessionClip {
  id: string;
  timestamp: string;
  description: string;
  transcript: string;
}

export interface SupervisionFeedback {
  id: string;
  supervisorName: string;
  feedbackDate: string;
  caseConceptualization: string;
  interventionSuggestions: string;
  riskManagement: string;
  ethicalConsiderations: string;
  overallEvaluation: string;
  overallRating: number;
  type?: string;
}

export interface SupervisionRecord {
  id: string;
  clientCode: string;
  counselorName: string;
  supervisorName: string;
  consultationTopic: string;
  status: SupervisionStatus;
  caseSummary: string;
  riskChanges: string;
  interventionGoals: string;
  sessionClips: SessionClip[];
  feedbackHistory: SupervisionFeedback[];
  submittedAt?: string;
  lastFeedbackAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "counselor" | "supervisor" | "admin";

const initialCaseRecords: CaseRecord[] = [
  {
    id: "cr1",
    clientCode: "C-042",
    consultationTopic: "焦虑障碍",
    sessionDate: "2026-06-10",
    mainConcern: "工作压力导致持续性焦虑，伴随失眠症状",
    emotionalState: "紧张不安",
    intervention: "呼吸放松训练 + 认知重构技术",
    nextGoal: "记录焦虑触发场景，每日练习深呼吸",
    createdAt: "2026-06-10T10:00:00Z",
    updatedAt: "2026-06-10T10:00:00Z"
  },
  {
    id: "cr2",
    clientCode: "C-119",
    consultationTopic: "亲密关系",
    sessionDate: "2026-06-09",
    mainConcern: "与伴侣沟通困难，经常陷入冷战",
    emotionalState: "低落委屈",
    intervention: "非暴力沟通训练 + 依恋模式探索",
    nextGoal: "尝试用观察-感受-需要-请求框架表达",
    createdAt: "2026-06-09T14:30:00Z",
    updatedAt: "2026-06-09T14:30:00Z"
  },
  {
    id: "cr3",
    clientCode: "C-203",
    consultationTopic: "职业压力",
    sessionDate: "2026-06-11",
    mainConcern: "工作负荷过大，职业倦怠感明显",
    emotionalState: "疲惫烦躁",
    intervention: "边界设定练习 + 压力管理策略",
    nextGoal: "制定工作时间边界，试行准时下班",
    createdAt: "2026-06-11T09:00:00Z",
    updatedAt: "2026-06-11T09:00:00Z"
  }
];

const CRISIS_KEYWORDS = ["自伤", "自杀", "自残", "失控", "轻生", "寻死", "不想活", "伤害自己", "结束生命", "崩溃"];

function detectCrisisSignals(text: string): string[] {
  if (!text) return [];
  return CRISIS_KEYWORDS.filter(kw => text.includes(kw));
}

function shouldTriggerCrisisWarning(
  riskLevel: RiskLevel,
  textFields: string[]
): { trigger: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (riskLevel === "high") {
    reasons.push("风险等级评为高风险");
  }
  const allCrisisSignals: string[] = [];
  for (const text of textFields) {
    const signals = detectCrisisSignals(text);
    allCrisisSignals.push(...signals);
  }
  const uniqueSignals = Array.from(new Set(allCrisisSignals));
  if (uniqueSignals.length > 0) {
    reasons.push(`录入内容包含危机信号：${uniqueSignals.join("、")}`);
  }
  return { trigger: reasons.length > 0, reasons };
}

const DEBOUNCE_WINDOW_MS = 30 * 60 * 1000;

function isDuplicateWarning(
  existingWarnings: CrisisWarning[],
  clientCode: string,
  now: number
): boolean {
  return existingWarnings.some(w => {
    if (w.clientCode !== clientCode) return false;
    if (w.status === "closed") return false;
    const created = new Date(w.createdAt).getTime();
    return now - created < DEBOUNCE_WINDOW_MS;
  });
}

const crisisWarningStatusLabels: Record<CrisisWarningStatus, string> = {
  pending: "待处理",
  confirmed: "已确认",
  escalated: "已升级",
  referred: "已转介",
  closed: "已关闭"
};

const crisisWarningStatusColors: Record<CrisisWarningStatus, string> = {
  pending: "cw-status-pending",
  confirmed: "cw-status-confirmed",
  escalated: "cw-status-escalated",
  referred: "cw-status-referred",
  closed: "cw-status-closed"
};

const initialCrisisWarnings: CrisisWarning[] = [
  {
    id: "cw1",
    clientCode: "C-042",
    triggerType: "risk_assessment",
    triggerId: "ra1",
    triggerReason: "风险等级评为高风险；自伤维度得分较高(3分)，存在明确自伤风险表达",
    status: "confirmed",
    createdAt: "2026-06-10T10:30:00Z",
    updatedAt: "2026-06-11T09:00:00Z",
    actions: [
      {
        id: "cwa1",
        fromStatus: "pending",
        toStatus: "confirmed",
        handler: "王督导",
        handledAt: "2026-06-11T09:00:00Z",
        description: "已确认风险属实，启动危机干预流程，联系来访者紧急联系人"
      }
    ]
  },
  {
    id: "cw2",
    clientCode: "C-042",
    triggerType: "case_record",
    triggerId: "cr1",
    triggerReason: "录入内容包含危机信号：自伤（主要困扰提及工作压力导致持续性焦虑伴随失眠，有偶发无望感表达）",
    status: "escalated",
    createdAt: "2026-06-10T10:05:00Z",
    updatedAt: "2026-06-12T14:00:00Z",
    actions: [
      {
        id: "cwa2",
        fromStatus: "pending",
        toStatus: "confirmed",
        handler: "李咨询师",
        handledAt: "2026-06-10T11:00:00Z",
        description: "已与来访者确认危机状况，制定安全计划"
      },
      {
        id: "cwa3",
        fromStatus: "confirmed",
        toStatus: "escalated",
        handler: "王督导",
        handledAt: "2026-06-12T14:00:00Z",
        description: "升级至机构危机干预小组，建议转介精神科评估"
      }
    ]
  }
];

let nextCrisisWarningId = 3;
let nextCrisisWarningActionId = 4;

const initialTimelineData: TimelineRecord[] = [
  { id: "1", clientCode: "C-042", sessionDate: "2026-06-10", topic: "焦虑", emotionalState: "紧张不安", intervention: "呼吸放松训练", nextGoal: "觉察焦虑触发场景" },
  { id: "2", clientCode: "C-042", sessionDate: "2026-06-03", topic: "焦虑", emotionalState: "恐惧加剧", intervention: "认知重构", nextGoal: "练习呼吸放松" },
  { id: "3", clientCode: "C-119", sessionDate: "2026-06-09", topic: "亲密关系", emotionalState: "低落委屈", intervention: "沟通模式分析", nextGoal: "尝试非暴力沟通表达" },
  { id: "4", clientCode: "C-119", sessionDate: "2026-05-26", topic: "亲密关系", emotionalState: "回避防御", intervention: "依恋风格探索", nextGoal: "识别回避模式" },
  { id: "5", clientCode: "C-203", sessionDate: "2026-06-11", topic: "职业压力", emotionalState: "疲惫烦躁", intervention: "边界设定练习", nextGoal: "制定工作时间边界" },
  { id: "6", clientCode: "C-203", sessionDate: "2026-05-28", topic: "职业压力", emotionalState: "焦虑无助", intervention: "压力源梳理", nextGoal: "设定下周边界练习" },
];

const initialRiskAssessments: RiskAssessment[] = [
  {
    id: "ra1",
    clientCode: "C-042",
    assessDate: "2026-06-10",
    dimensions: { sleep: 3, emotion: 3, selfHarm: 2, support: 3, stress: 3 },
    totalScore: 14,
    level: "medium",
    summary: "睡眠受扰明显，情绪调节困难，有偶发无望感表达，需持续关注"
  },
  {
    id: "ra2",
    clientCode: "C-119",
    assessDate: "2026-06-09",
    dimensions: { sleep: 2, emotion: 2, selfHarm: 1, support: 2, stress: 2 },
    totalScore: 9,
    level: "watch",
    summary: "关系议题带来情绪起伏，支持系统尚可，建议两周复评"
  },
  {
    id: "ra3",
    clientCode: "C-203",
    assessDate: "2026-06-11",
    dimensions: { sleep: 2, emotion: 1, selfHarm: 1, support: 2, stress: 1 },
    totalScore: 7,
    level: "stable",
    summary: "整体状态平稳，压力可控，继续常规跟进"
  }
];

const goalStatusLabels: Record<GoalStatus, string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成"
};

const goalStatusColors: Record<GoalStatus, string> = {
  active: "goal-active",
  paused: "goal-paused",
  completed: "goal-completed"
};

const supervisionStatusLabels: Record<SupervisionStatus, string> = {
  draft: "草稿",
  pending: "待督导",
  feedback: "已反馈"
};

const supervisionStatusColors: Record<SupervisionStatus, string> = {
  draft: "sup-status-draft",
  pending: "sup-status-pending",
  feedback: "sup-status-feedback"
};

const initialSupervisionRecords: SupervisionRecord[] = [
  {
    id: "sv1",
    clientCode: "C-042",
    counselorName: "李咨询师",
    supervisorName: "王督导",
    consultationTopic: "焦虑障碍",
    status: "feedback",
    caseSummary: "来访者C-042，女性，28岁，互联网产品经理。因工作压力导致持续性焦虑伴失眠症状来访，每周一次咨询，已进行6次会谈。主要表现为：工作时难以集中注意力，反复担心项目延期，夜间入睡困难且易惊醒。近期因公司组织架构调整，焦虑情绪有所加剧。",
    riskChanges: "初始评估风险等级为中风险（14分），睡眠和情绪维度得分较高。经过4次咨询后，睡眠质量略有改善，但情绪波动仍较明显。近期因工作变动，自伤维度得分从2分上升至3分，需重点关注。",
    interventionGoals: "1. 焦虑触发场景觉察：已完成2/5步骤，能够识别3个主要焦虑触发场景\n2. 认知重构能力建立：已完成1/6步骤，初步学习识别灾难化思维\n3. 睡眠改善计划：正在进行，睡眠时长从5小时提升至6小时左右",
    sessionClips: [
      {
        id: "clip1",
        timestamp: "第3次会谈 25:30",
        description: "来访者谈及工作压力时的情绪爆发",
        transcript: "来访者：我真的觉得撑不下去了，每天一想到要上班就心慌...（声音哽咽）我也不知道为什么，就是控制不住地担心。咨询师：听起来这种担心让你很疲惫，能具体说说最近一次有这种感觉是什么时候吗？"
      },
      {
        id: "clip2",
        timestamp: "第5次会谈 12:15",
        description: "认知重构练习中的关键突破",
        transcript: "咨询师：如果项目真的延期了，你觉得最糟糕的结果是什么？来访者：可能会被辞退吧... 咨询师：嗯，这是一个可能。那你觉得这个可能性有多大呢？来访者：...其实好像也没那么大，之前也有项目延期过，好像也没怎么样。"
      }
    ],
    feedbackHistory: [
      {
        id: "fb1",
        supervisorName: "王督导",
        feedbackDate: "2026-06-12",
        caseConceptualization: "个案概念化基本准确，能够从来访者的认知模式入手理解焦虑的形成机制。建议补充依恋风格的探索，了解其早年经历对当前焦虑模式的影响。",
        interventionSuggestions: "1. 认知重构技术运用得当，但在识别自动化思维的深度上还可以加强\n2. 建议加入呼吸放松训练的日常练习督导，确保来访者正确掌握\n3. 可以考虑引入行为激活技术，帮助来访者逐步恢复功能\n4. 第5次会谈中的苏格拉底式提问运用较好，继续保持",
        riskManagement: "风险评估及时，能够关注到自伤维度的变化。建议：\n1. 制定更具体的安全计划，包括危机联系人\n2. 增加情绪日记的记录频率\n3. 考虑是否需要转介精神科评估药物治疗的可能性",
        ethicalConsiderations: "咨询边界清晰，知情同意到位。需要注意：\n1. 来访者近期情绪波动较大，需确认咨询频率是否合适\n2. 保密原则在高风险情况下的处理预案需明确",
        overallEvaluation: "整体咨询思路清晰，技术运用基本规范。在个案概念化的深度和风险干预的具体性上有提升空间。继续保持每周督导的频率。",
        overallRating: 4
      }
    ],
    submittedAt: "2026-06-11T10:00:00Z",
    lastFeedbackAt: "2026-06-12T15:30:00Z",
    createdAt: "2026-06-05T09:00:00Z",
    updatedAt: "2026-06-12T15:30:00Z"
  },
  {
    id: "sv2",
    clientCode: "C-119",
    counselorName: "李咨询师",
    supervisorName: "王督导",
    consultationTopic: "亲密关系",
    status: "pending",
    caseSummary: "来访者C-119，男性，32岁，设计师。因与伴侣沟通困难、经常冷战来访，每两周一次咨询，已进行3次会谈。来访者在亲密关系中表现出明显的回避模式，遇到冲突时倾向于退缩和冷战。",
    riskChanges: "风险等级为关注（9分），情绪维度得分稍高。整体风险可控，但关系冲突带来的情绪困扰较明显。",
    interventionGoals: "1. 非暴力沟通表达：已完成2/4步骤，能够在会谈中进行角色扮演\n2. 回避模式识别：已完成，梳理出3个典型回避场景",
    sessionClips: [
      {
        id: "clip3",
        timestamp: "第2次会谈 18:45",
        description: "来访者描述回避模式的典型场景",
        transcript: "来访者：她一跟我吵架，我就只想躲起来，什么都不想说。咨询师：那个时候你心里是什么感觉？来访者：...就是觉得很累，说了也没用，不如不说。"
      }
    ],
    feedbackHistory: [],
    submittedAt: "2026-06-15T14:00:00Z",
    createdAt: "2026-06-08T11:00:00Z",
    updatedAt: "2026-06-15T14:00:00Z"
  },
  {
    id: "sv3",
    clientCode: "C-203",
    counselorName: "张咨询师",
    supervisorName: "王督导",
    consultationTopic: "职业压力",
    status: "draft",
    caseSummary: "来访者C-203，女性，35岁，部门经理。因工作负荷过大、职业倦怠感明显来访，每周一次咨询，已进行2次会谈。",
    riskChanges: "风险等级为稳定（7分），整体状态良好。",
    interventionGoals: "1. 工作时间边界设定：刚启动，完成边界缺失点梳理\n2. 压力源清单整理：已暂停",
    sessionClips: [],
    feedbackHistory: [],
    createdAt: "2026-06-14T16:00:00Z",
    updatedAt: "2026-06-16T10:00:00Z"
  }
];

let nextSupervisionId = 4;
let nextFeedbackId = 2;
let nextClipId = 4;

const initialGoals: InterventionGoal[] = [
  {
    id: "g1",
    clientCode: "C-042",
    goalTitle: "焦虑触发场景觉察",
    description: "学会识别和记录日常焦虑触发场景，建立自我觉察习惯",
    status: "active",
    totalSteps: 5,
    completedSteps: 2,
    lastAction: "完成呼吸放松练习，记录3个焦虑场景",
    lastActionDate: "2026-06-10",
    nextPractice: "每日焦虑场景记录表填写",
    nextPracticeDate: "2026-06-17",
    createdAt: "2026-05-20"
  },
  {
    id: "g2",
    clientCode: "C-042",
    goalTitle: "认知重构能力建立",
    description: "掌握认知歪曲识别方法，能对自动化思维进行合理反驳",
    status: "active",
    totalSteps: 6,
    completedSteps: 1,
    lastAction: "学习识别灾难化思维模式",
    lastActionDate: "2026-06-03",
    nextPractice: "完成思维记录表中的反驳栏填写",
    nextPracticeDate: "2026-06-17",
    createdAt: "2026-06-03"
  },
  {
    id: "g3",
    clientCode: "C-119",
    goalTitle: "非暴力沟通表达",
    description: "学会用观察-感受-需要-请求框架表达自身需求",
    status: "active",
    totalSteps: 4,
    completedSteps: 2,
    lastAction: "在会谈中角色扮演表达感受",
    lastActionDate: "2026-06-09",
    nextPractice: "与伴侣尝试一次非暴力沟通对话",
    nextPracticeDate: "2026-06-16",
    createdAt: "2026-05-26"
  },
  {
    id: "g4",
    clientCode: "C-119",
    goalTitle: "回避模式识别",
    description: "识别亲密关系中的回避防御机制及触发条件",
    status: "completed",
    totalSteps: 3,
    completedSteps: 3,
    lastAction: "梳理出3个典型回避场景及背后需求",
    lastActionDate: "2026-06-02",
    nextPractice: "",
    nextPracticeDate: "",
    createdAt: "2026-05-12"
  },
  {
    id: "g5",
    clientCode: "C-203",
    goalTitle: "工作时间边界设定",
    description: "建立明确的工作与生活边界，减少过度加班",
    status: "active",
    totalSteps: 4,
    completedSteps: 1,
    lastAction: "梳理当前工作中的压力源与边界缺失点",
    lastActionDate: "2026-06-11",
    nextPractice: "本周试行准时下班一天并记录感受",
    nextPracticeDate: "2026-06-18",
    createdAt: "2026-05-28"
  },
  {
    id: "g6",
    clientCode: "C-203",
    goalTitle: "压力源清单整理",
    description: "系统梳理工作与生活中的压力源并分级",
    status: "paused",
    totalSteps: 3,
    completedSteps: 1,
    lastAction: "初步列出5项主要压力源",
    lastActionDate: "2026-05-28",
    nextPractice: "对压力源进行可控性分类",
    nextPracticeDate: "",
    createdAt: "2026-05-15"
  }
];

let nextGoalId = 7;
let nextCaseRecordId = 4;

const emotionalOptions = ["平静", "低落", "焦虑", "紧张不安", "恐惧加剧", "回避防御", "低落委屈", "疲惫烦躁", "焦虑无助", "愤怒", "麻木"];

const riskLevelLabels: Record<RiskLevel, string> = {
  stable: "稳定",
  watch: "关注",
  medium: "中风险",
  high: "高风险"
};

const riskLevelColors: Record<RiskLevel, string> = {
  stable: "risk-stable",
  watch: "risk-watch",
  medium: "risk-medium",
  high: "risk-high"
};

const dimensionOptions: Record<keyof RiskDimensions, { label: string; options: { score: number; text: string }[] }> = {
  sleep: {
    label: "睡眠质量",
    options: [
      { score: 1, text: "睡眠良好（7小时以上，质量好）" },
      { score: 2, text: "偶有影响（6-7小时，偶尔醒来）" },
      { score: 3, text: "明显受扰（5-6小时，频繁醒来）" },
      { score: 4, text: "严重失眠（5小时以下，入睡困难或早醒）" }
    ]
  },
  emotion: {
    label: "情绪波动",
    options: [
      { score: 1, text: "平稳可控" },
      { score: 2, text: "偶有起伏，可自行调节" },
      { score: 3, text: "波动频繁，调节困难" },
      { score: 4, text: "剧烈波动，失控感强烈" }
    ]
  },
  selfHarm: {
    label: "自伤表达",
    options: [
      { score: 1, text: "无相关表达" },
      { score: 2, text: '偶有无望感或"没意思"表述' },
      { score: 3, text: "明确提及自伤想法" },
      { score: 4, text: "有具体自伤计划或近期尝试" }
    ]
  },
  support: {
    label: "支持系统",
    options: [
      { score: 1, text: "支持完善（家人朋友同事多方支持）" },
      { score: 2, text: "有一定支持但不充分" },
      { score: 3, text: "支持薄弱（仅有1-2人或疏远）" },
      { score: 4, text: "几乎无人可依靠" }
    ]
  },
  stress: {
    label: "近期压力事件",
    options: [
      { score: 1, text: "无明显压力" },
      { score: 2, text: "日常工作生活压力" },
      { score: 3, text: "重大变故（失业、分手、疾病等）" },
      { score: 4, text: "多重压力叠加/创伤性事件" }
    ]
  }
};

const followUpReminders: Record<RiskLevel, string[]> = {
  stable: [
    "按常规咨询周期跟进",
    "建议1个月后复评一次",
    "鼓励继续日常觉察练习"
  ],
  watch: [
    "2周后主动复评",
    "中间增加一次电话或线上关怀",
    "留意睡眠和情绪变化趋势"
  ],
  medium: [
    "48小时内完成一次复评",
    "每周至少2次结构化跟进",
    "制定书面安全计划并签字确认",
    "在知情同意前提下通知家属",
    "建议每周个案督导"
  ],
  high: [
    "24小时内启动危机干预流程",
    "立即联系紧急联系人/家属",
    "每日一次跟进直至风险降级",
    "评估转介精神科门诊的必要性",
    "同步机构督导并备案记录",
    "确认安全计划可执行性"
  ]
};

function calculateRisk(dimensions: RiskDimensions): { level: RiskLevel; score: number } {
  const { sleep, emotion, selfHarm, support, stress } = dimensions;
  let score = sleep + emotion + selfHarm + support + stress;

  let level: RiskLevel;
  if (selfHarm === 4) {
    level = "high";
  } else if (selfHarm === 3) {
    level = score >= 15 ? "high" : "medium";
  } else if (score >= 15) {
    level = "high";
  } else if (score >= 10) {
    level = "medium";
  } else if (score >= 6) {
    level = "watch";
  } else {
    level = "stable";
  }

  return { level, score };
}

let nextTimelineId = 7;
let nextRiskId = 4;

function MetricCard({ label, value, index, highlight }: { label: string; value: string; index: number; highlight?: boolean }) {
  return (
    <article className={`metric-card ${highlight ? "metric-highlight" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function TimelineSection({
  clientCodes,
  records,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  crisisWarningByClient,
}: {
  clientCodes: string[];
  records: TimelineRecord[];
  onAddRecord: (r: TimelineRecord) => void;
  onUpdateRecord: (r: TimelineRecord) => void;
  onDeleteRecord: (id: string) => void;
  crisisWarningByClient: Map<string, CrisisWarningStatus>;
}) {
  const [selectedClient, setSelectedClient] = useState<string>(clientCodes[0] || "C-042");
  const [editingRecord, setEditingRecord] = useState<TimelineRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const availableCodes = Array.from(new Set([...clientCodes, ...records.map(r => r.clientCode)]));
  const filtered = records
    .filter(r => r.clientCode === selectedClient)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

  const openNewForm = () => {
    setEditingRecord({
      id: "",
      clientCode: selectedClient,
      sessionDate: new Date().toISOString().slice(0, 10),
      topic: "",
      emotionalState: emotionalOptions[0],
      intervention: "",
      nextGoal: "",
    });
    setIsFormOpen(true);
  };

  const openEditForm = (record: TimelineRecord) => {
    setEditingRecord({ ...record });
    setIsFormOpen(true);
  };

  const handleSave = () => {
    if (!editingRecord) return;
    if (!editingRecord.topic || !editingRecord.intervention || !editingRecord.nextGoal) return;
    if (editingRecord.id) {
      onUpdateRecord(editingRecord);
    } else {
      const newRecord = { ...editingRecord, id: String(nextTimelineId++) };
      onAddRecord(newRecord);
    }
    setIsFormOpen(false);
    setEditingRecord(null);
  };

  const handleDelete = (id: string) => {
    onDeleteRecord(id);
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingRecord(null);
  };

  const updateField = (field: keyof TimelineRecord, value: string) => {
    if (!editingRecord) return;
    setEditingRecord({ ...editingRecord, [field]: value });
  };

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>会谈时间线</p>
          <h2>按来访者查看</h2>
        </div>
        <button className="primary-action" onClick={openNewForm}>新增时间线</button>
      </div>

      <div className="tl-client-tabs">
        {availableCodes.map(code => (
          <button
            key={code}
            className={code === selectedClient ? "tl-tab active" : "tl-tab"}
            onClick={() => setSelectedClient(code)}
          >
            {code}
          </button>
        ))}
      </div>

      {isFormOpen && editingRecord && (
        <div className="tl-form-panel">
          <div className="tl-form-grid">
            <label>
              <span>来访者代号</span>
              <input
                value={editingRecord.clientCode}
                onChange={e => updateField("clientCode", e.target.value)}
              />
            </label>
            <label>
              <span>会谈日期</span>
              <input
                type="date"
                value={editingRecord.sessionDate}
                onChange={e => updateField("sessionDate", e.target.value)}
              />
            </label>
            <label>
              <span>咨询主题</span>
              <input
                value={editingRecord.topic}
                placeholder="填写咨询主题"
                onChange={e => updateField("topic", e.target.value)}
              />
            </label>
            <label>
              <span>情绪状态</span>
              <select
                value={editingRecord.emotionalState}
                onChange={e => updateField("emotionalState", e.target.value)}
              >
                {emotionalOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label className="tl-form-full">
              <span>干预方法</span>
              <input
                value={editingRecord.intervention}
                placeholder="填写干预方法"
                onChange={e => updateField("intervention", e.target.value)}
              />
            </label>
            <label className="tl-form-full">
              <span>下次目标</span>
              <input
                value={editingRecord.nextGoal}
                placeholder="填写下次目标"
                onChange={e => updateField("nextGoal", e.target.value)}
              />
            </label>
          </div>
          <div className="tl-form-actions">
            <button onClick={handleCancel}>取消</button>
            <button className="primary-action" onClick={handleSave}>保存</button>
          </div>
        </div>
      )}

      <div className="tl-timeline">
        {filtered.length === 0 && (
          <p className="tl-empty">该来访者暂无会谈记录</p>
        )}
        {filtered.map(record => (
          <article key={record.id} className="tl-card">
            <div className="tl-card-dot" />
            <div className="tl-card-body">
              <div className="tl-card-header">
                <span className="tl-card-date">{record.sessionDate}</span>
                <span className="tl-card-topic">{record.topic}</span>
                {crisisWarningByClient.has(record.clientCode) && (
                  <span className="cw-indicator-badge small">
                    🚨 {crisisWarningStatusLabels[crisisWarningByClient.get(record.clientCode)!]}
                  </span>
                )}
              </div>
              <div className="tl-card-fields">
                <div className="tl-field">
                  <span className="tl-field-label">情绪状态</span>
                  <span className="tl-field-value">{record.emotionalState}</span>
                </div>
                <div className="tl-field">
                  <span className="tl-field-label">干预方法</span>
                  <span className="tl-field-value">{record.intervention}</span>
                </div>
                <div className="tl-field">
                  <span className="tl-field-label">下次目标</span>
                  <span className="tl-field-value">{record.nextGoal}</span>
                </div>
              </div>
              <div className="tl-card-actions">
                <button onClick={() => openEditForm(record)}>编辑</button>
                <button className="tl-btn-danger" onClick={() => handleDelete(record.id)}>删除</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RiskAssessmentSection({
  assessments,
  onAddAssessment,
  onDeleteAssessment,
  allClientCodes
}: {
  assessments: RiskAssessment[];
  onAddAssessment: (a: RiskAssessment) => void;
  onDeleteAssessment: (id: string) => void;
  allClientCodes: string[];
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>(
    allClientCodes.length > 0 ? allClientCodes[0] : "C-042"
  );
  const [formData, setFormData] = useState<RiskDimensions>({
    sleep: 1,
    emotion: 1,
    selfHarm: 1,
    support: 1,
    stress: 1
  });
  const [summary, setSummary] = useState("");

  const preview = useMemo(() => calculateRisk(formData), [formData]);

  const openForm = () => {
    setFormData({ sleep: 1, emotion: 1, selfHarm: 1, support: 1, stress: 1 });
    setSummary("");
    setIsFormOpen(true);
  };

  const handleSave = () => {
    const { level, score } = preview;
    const assessment: RiskAssessment = {
      id: "ra" + nextRiskId++,
      clientCode: selectedClient,
      assessDate: new Date().toISOString().slice(0, 10),
      dimensions: { ...formData },
      totalScore: score,
      level,
      summary: summary.trim() || generateAutoSummary(formData, level, score)
    };
    onAddAssessment(assessment);
    setIsFormOpen(false);
  };

  const generateAutoSummary = (d: RiskDimensions, level: RiskLevel, score: number): string => {
    const parts: string[] = [];
    if (d.sleep >= 3) parts.push("睡眠受扰");
    if (d.emotion >= 3) parts.push("情绪调节困难");
    if (d.selfHarm >= 3) parts.push("自伤风险需重点关注");
    if (d.support >= 3) parts.push("支持系统薄弱");
    if (d.stress >= 3) parts.push("压力水平较高");
    if (parts.length === 0) parts.push("整体状态良好");
    return `综合评分${score}分（${riskLevelLabels[level]}）：${parts.join("，")}`;
  };

  const clientAssessments = assessments
    .filter(a => a.clientCode === selectedClient)
    .sort((a, b) => b.assessDate.localeCompare(a.assessDate));

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>风险等级评估</p>
          <h2>五维筛查与跟进建议</h2>
        </div>
        <button className="primary-action" onClick={openForm}>新增评估</button>
      </div>

      <div className="tl-client-tabs">
        {allClientCodes.map(code => (
          <button
            key={code}
            className={code === selectedClient ? "tl-tab active" : "tl-tab"}
            onClick={() => setSelectedClient(code)}
          >
            {code}
          </button>
        ))}
      </div>

      {isFormOpen && (
        <div className="tl-form-panel">
          <div className="risk-form-header">
            <div className="risk-preview">
              <div className="risk-preview-label">实时评估</div>
              <div className={`risk-badge ${riskLevelColors[preview.level]}`}>
                {riskLevelLabels[preview.level]}
              </div>
              <div className="risk-score">总分 {preview.score} / 20</div>
            </div>
            <div className="risk-level-bar">
              <div className="risk-bar-stable" style={{ width: "25%" }}>稳定 0-5</div>
              <div className="risk-bar-watch" style={{ width: "20%" }}>关注 6-9</div>
              <div className="risk-bar-medium" style={{ width: "25%" }}>中风险 10-14</div>
              <div className="risk-bar-high" style={{ width: "30%" }}>高风险 15+</div>
              <div
                className="risk-bar-pointer"
                style={{ left: `${Math.min(95, (preview.score / 20) * 100)}%` }}
              >▲</div>
            </div>
          </div>

          <div className="risk-dim-grid">
            {(Object.keys(dimensionOptions) as (keyof RiskDimensions)[]).map(key => {
              const dim = dimensionOptions[key];
              return (
                <div key={key} className="risk-dim-card">
                  <div className="risk-dim-label">{dim.label}</div>
                  <div className="risk-dim-options">
                    {dim.options.map(opt => (
                      <label key={opt.score} className={`risk-opt ${formData[key] === opt.score ? "selected" : ""}`}>
                        <input
                          type="radio"
                          name={key}
                          checked={formData[key] === opt.score}
                          onChange={() => setFormData(prev => ({ ...prev, [key]: opt.score }))}
                        />
                        <span className="risk-opt-score">{opt.score}</span>
                        <span className="risk-opt-text">{opt.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="risk-result-panel">
            <h4 className="risk-result-title">
              建议等级：<span className={`risk-badge-inline ${riskLevelColors[preview.level]}`}>{riskLevelLabels[preview.level]}</span>
            </h4>
            <div className="risk-reminder-list">
              <div className="risk-reminder-label">后续跟进提醒</div>
              <ul>
                {followUpReminders[preview.level].map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <label className="risk-summary-label">
            <span>评估摘要（可编辑）</span>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder={generateAutoSummary(formData, preview.level, preview.score)}
              rows={3}
            />
          </label>

          <div className="tl-form-actions">
            <button onClick={() => setIsFormOpen(false)}>取消</button>
            <button className="primary-action" onClick={handleSave}>保存评估</button>
          </div>
        </div>
      )}

      <div className="risk-assessment-list">
        {clientAssessments.length === 0 && (
          <p className="tl-empty">该来访者暂无风险评估记录，点击"新增评估"开始录入</p>
        )}
        {clientAssessments.map(assess => (
          <article key={assess.id} className="risk-history-card">
            <div className="risk-history-header">
              <span className="tl-card-date">{assess.assessDate}</span>
              <span className={`risk-badge ${riskLevelColors[assess.level]}`}>
                {riskLevelLabels[assess.level]}
              </span>
              <span className="risk-score-small">评分 {assess.totalScore}</span>
              <button
                className="tl-btn-danger"
                onClick={() => onDeleteAssessment(assess.id)}
              >删除</button>
            </div>
            <div className="risk-dim-scores">
              {(Object.keys(assess.dimensions) as (keyof RiskDimensions)[]).map(key => (
                <div key={key} className="dim-score-tag">
                  <span className="dim-name">{dimensionOptions[key].label}</span>
                  <span className="dim-value">{assess.dimensions[key]}</span>
                </div>
              ))}
            </div>
            <p className="risk-summary-text">{assess.summary}</p>
            <div className="risk-reminder-list compact">
              <div className="risk-reminder-label">跟进提醒</div>
              <ul>
                {followUpReminders[assess.level].map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function GoalTrackingSection({
  goals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  allClientCodes
}: {
  goals: InterventionGoal[];
  onAddGoal: (g: InterventionGoal) => void;
  onUpdateGoal: (g: InterventionGoal) => void;
  onDeleteGoal: (id: string) => void;
  allClientCodes: string[];
}) {
  const [selectedClient, setSelectedClient] = useState<string>(allClientCodes[0] || "C-042");
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<InterventionGoal | null>(null);

  const availableCodes = Array.from(new Set([...allClientCodes, ...goals.map(g => g.clientCode)])).sort();

  const filteredGoals = goals
    .filter(g => g.clientCode === selectedClient)
    .filter(g => statusFilter === "all" || g.status === statusFilter)
    .sort((a, b) => {
      const statusOrder: Record<GoalStatus, number> = { active: 0, paused: 1, completed: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      return b.createdAt.localeCompare(a.createdAt);
    });

  const statusCounts = useMemo(() => {
    const clientGoals = goals.filter(g => g.clientCode === selectedClient);
    return {
      all: clientGoals.length,
      active: clientGoals.filter(g => g.status === "active").length,
      paused: clientGoals.filter(g => g.status === "paused").length,
      completed: clientGoals.filter(g => g.status === "completed").length,
    };
  }, [goals, selectedClient]);

  const progressSummary = useMemo(() => {
    const clientGoals = goals.filter(g => g.clientCode === selectedClient && g.status === "active");
    if (clientGoals.length === 0) return { avgProgress: 0, totalActive: 0, totalSteps: 0, completedSteps: 0 };
    const totalSteps = clientGoals.reduce((s, g) => s + g.totalSteps, 0);
    const completedSteps = clientGoals.reduce((s, g) => s + g.completedSteps, 0);
    return {
      avgProgress: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
      totalActive: clientGoals.length,
      totalSteps,
      completedSteps,
    };
  }, [goals, selectedClient]);

  const openNewForm = () => {
    setEditingGoal({
      id: "",
      clientCode: selectedClient,
      goalTitle: "",
      description: "",
      status: "active",
      totalSteps: 4,
      completedSteps: 0,
      lastAction: "",
      lastActionDate: new Date().toISOString().slice(0, 10),
      nextPractice: "",
      nextPracticeDate: "",
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setIsFormOpen(true);
  };

  const openEditForm = (goal: InterventionGoal) => {
    setEditingGoal({ ...goal });
    setIsFormOpen(true);
  };

  const handleSave = () => {
    if (!editingGoal) return;
    if (!editingGoal.goalTitle) return;
    let totalSteps = editingGoal.totalSteps < 1 ? 1 : editingGoal.totalSteps;
    let completedSteps = Math.min(editingGoal.completedSteps, totalSteps);
    let status: GoalStatus = completedSteps >= totalSteps ? "completed" : editingGoal.status;
    const finalGoal: InterventionGoal = {
      ...editingGoal,
      totalSteps,
      completedSteps,
      status,
    };
    if (finalGoal.id) {
      onUpdateGoal(finalGoal);
    } else {
      onAddGoal({ ...finalGoal, id: "g" + nextGoalId++ });
    }
    setIsFormOpen(false);
    setEditingGoal(null);
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingGoal(null);
  };

  const updateField = <K extends keyof InterventionGoal>(field: K, value: InterventionGoal[K]) => {
    if (!editingGoal) return;
    setEditingGoal({ ...editingGoal, [field]: value });
  };

  const handleStepChange = (field: "totalSteps" | "completedSteps", raw: string) => {
    const minVal = field === "totalSteps" ? 1 : 0;
    const val = Math.max(minVal, Math.min(99, parseInt(raw) || minVal));
    if (!editingGoal) return;
    const updated = { ...editingGoal, [field]: val };
    if (field === "totalSteps" && updated.completedSteps > val) {
      updated.completedSteps = val;
    }
    if (field === "completedSteps" && val >= updated.totalSteps) {
      updated.status = "completed";
    }
    setEditingGoal(updated);
  };

  const renderProgressBar = (completed: number, total: number) => {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return (
      <div className="goal-progress-bar">
        <div className="goal-progress-fill" style={{ width: `${pct}%` }} />
        <span className="goal-progress-text">{completed}/{total} · {pct}%</span>
      </div>
    );
  };

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>干预目标追踪</p>
          <h2>阶段目标与进度管理</h2>
        </div>
        <button className="primary-action" onClick={openNewForm}>新增目标</button>
      </div>

      <div className="tl-client-tabs">
        {availableCodes.map(code => (
          <button
            key={code}
            className={code === selectedClient ? "tl-tab active" : "tl-tab"}
            onClick={() => setSelectedClient(code)}
          >
            {code}
          </button>
        ))}
      </div>

      <div className="goal-summary-row">
        <div className="goal-summary-card">
          <span className="goal-summary-label">活跃目标</span>
          <strong className="goal-summary-value">{progressSummary.totalActive}</strong>
        </div>
        <div className="goal-summary-card">
          <span className="goal-summary-label">总体进度</span>
          <strong className="goal-summary-value">{progressSummary.avgProgress}%</strong>
        </div>
        <div className="goal-summary-card">
          <span className="goal-summary-label">已完成步骤</span>
          <strong className="goal-summary-value">{progressSummary.completedSteps}/{progressSummary.totalSteps}</strong>
        </div>
      </div>

      <div className="goal-status-tabs">
        {(["all", "active", "paused", "completed"] as const).map(s => (
          <button
            key={s}
            className={`goal-status-tab ${statusFilter === s ? "active" : ""} ${s !== "all" ? goalStatusColors[s] : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "全部" : goalStatusLabels[s]}
            <span className="goal-status-count">{statusCounts[s]}</span>
          </button>
        ))}
      </div>

      {isFormOpen && editingGoal && (
        <div className="tl-form-panel">
          <div className="goal-form-grid">
            <label>
              <span>来访者代号</span>
              <input
                value={editingGoal.clientCode}
                onChange={e => updateField("clientCode", e.target.value)}
              />
            </label>
            <label>
              <span>目标状态</span>
              <select
                value={editingGoal.status}
                onChange={e => updateField("status", e.target.value as GoalStatus)}
              >
                <option value="active">进行中</option>
                <option value="paused">已暂停</option>
                <option value="completed">已完成</option>
              </select>
            </label>
            <label className="tl-form-full">
              <span>阶段目标</span>
              <input
                value={editingGoal.goalTitle}
                placeholder="填写阶段目标名称"
                onChange={e => updateField("goalTitle", e.target.value)}
              />
            </label>
            <label className="tl-form-full">
              <span>目标描述</span>
              <textarea
                value={editingGoal.description}
                placeholder="描述该阶段目标的具体内容和达成标准"
                rows={2}
                onChange={e => updateField("description", e.target.value)}
              />
            </label>
            <label>
              <span>总步骤数</span>
              <input
                type="number"
                min={1}
                max={99}
                value={editingGoal.totalSteps}
                onChange={e => handleStepChange("totalSteps", e.target.value)}
              />
            </label>
            <label>
              <span>已完成步骤</span>
              <input
                type="number"
                min={0}
                max={editingGoal.totalSteps}
                value={editingGoal.completedSteps}
                onChange={e => handleStepChange("completedSteps", e.target.value)}
              />
            </label>
            <label className="tl-form-full">
              <span>最近一次行动</span>
              <input
                value={editingGoal.lastAction}
                placeholder="描述来访者最近完成的一次行动"
                onChange={e => updateField("lastAction", e.target.value)}
              />
            </label>
            <label>
              <span>行动日期</span>
              <input
                type="date"
                value={editingGoal.lastActionDate}
                onChange={e => updateField("lastActionDate", e.target.value)}
              />
            </label>
            <label className="tl-form-full">
              <span>下次练习</span>
              <input
                value={editingGoal.nextPractice}
                placeholder="安排的下次练习内容"
                onChange={e => updateField("nextPractice", e.target.value)}
              />
            </label>
            <label>
              <span>练习日期</span>
              <input
                type="date"
                value={editingGoal.nextPracticeDate}
                onChange={e => updateField("nextPracticeDate", e.target.value)}
              />
            </label>
          </div>
          <div className="tl-form-actions">
            <button onClick={handleCancel}>取消</button>
            <button className="primary-action" onClick={handleSave}>保存目标</button>
          </div>
        </div>
      )}

      <div className="goal-list">
        {filteredGoals.length === 0 && (
          <p className="tl-empty">
            {statusFilter === "all" ? "该来访者暂无干预目标，点击「新增目标」开始录入" : `该来访者暂无${goalStatusLabels[statusFilter]}的目标`}
          </p>
        )}
        {filteredGoals.map(goal => (
          <article key={goal.id} className="goal-card">
            <div className="goal-card-header">
              <div className="goal-card-title-row">
                <h3 className="goal-card-title">{goal.goalTitle}</h3>
                <span className={`goal-badge ${goalStatusColors[goal.status]}`}>
                  {goalStatusLabels[goal.status]}
                </span>
              </div>
              {goal.description && <p className="goal-card-desc">{goal.description}</p>}
            </div>
            <div className="goal-card-progress">
              {renderProgressBar(goal.completedSteps, goal.totalSteps)}
            </div>
            <div className="goal-card-details">
              <div className="goal-detail-item">
                <span className="goal-detail-label">最近行动</span>
                <span className="goal-detail-value">{goal.lastAction || "—"}</span>
                {goal.lastActionDate && <span className="goal-detail-date">{goal.lastActionDate}</span>}
              </div>
              <div className="goal-detail-item">
                <span className="goal-detail-label">下次练习</span>
                <span className="goal-detail-value">{goal.nextPractice || "—"}</span>
                {goal.nextPracticeDate && <span className="goal-detail-date">{goal.nextPracticeDate}</span>}
              </div>
            </div>
            <div className="goal-card-footer">
              <span className="goal-card-created">创建于 {goal.createdAt}</span>
              <div className="goal-card-actions">
                <button onClick={() => openEditForm(goal)}>编辑</button>
                <button className="tl-btn-danger" onClick={() => onDeleteGoal(goal.id)}>删除</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const VALID_TRANSITIONS: Record<CrisisWarningStatus, CrisisWarningStatus[]> = {
  pending: ["confirmed", "escalated", "referred", "closed"],
  confirmed: ["escalated", "referred", "closed"],
  escalated: ["referred", "closed"],
  referred: ["closed"],
  closed: [],
};

function CrisisWarningSection({
  warnings,
  onAddWarning,
  onUpdateWarning,
  onDeleteWarning,
  allClientCodes,
  role,
}: {
  warnings: CrisisWarning[];
  onAddWarning: (w: CrisisWarning) => void;
  onUpdateWarning: (w: CrisisWarning) => void;
  onDeleteWarning: (id: string) => void;
  allClientCodes: string[];
  role: UserRole;
}) {
  const [statusFilter, setStatusFilter] = useState<CrisisWarningStatus | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [selectedWarning, setSelectedWarning] = useState<CrisisWarning | null>(null);
  const [isHandling, setIsHandling] = useState(false);
  const [handleForm, setHandleForm] = useState<{
    toStatus: CrisisWarningStatus;
    handler: string;
    description: string;
  } | null>(null);

  const availableClientCodes = useMemo(() => {
    const codes = new Set([...allClientCodes, ...warnings.map(w => w.clientCode)]);
    return Array.from(codes).sort();
  }, [allClientCodes, warnings]);

  const statusCounts = useMemo(() => {
    const filtered = clientFilter === "all" ? warnings : warnings.filter(w => w.clientCode === clientFilter);
    return {
      all: filtered.length,
      pending: filtered.filter(w => w.status === "pending").length,
      confirmed: filtered.filter(w => w.status === "confirmed").length,
      escalated: filtered.filter(w => w.status === "escalated").length,
      referred: filtered.filter(w => w.status === "referred").length,
      closed: filtered.filter(w => w.status === "closed").length,
    };
  }, [warnings, clientFilter]);

  const filteredWarnings = useMemo(() => {
    let result = warnings;
    if (clientFilter !== "all") {
      result = result.filter(w => w.clientCode === clientFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter(w => w.status === statusFilter);
    }
    return result.sort((a, b) => {
      const statusOrder: Record<CrisisWarningStatus, number> = { pending: 0, confirmed: 1, escalated: 2, referred: 3, closed: 4 };
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [warnings, statusFilter, clientFilter]);

  useEffect(() => {
    if (selectedWarning) {
      const latest = warnings.find(w => w.id === selectedWarning.id);
      if (latest && JSON.stringify(latest) !== JSON.stringify(selectedWarning)) {
        setSelectedWarning(latest);
      }
    }
  }, [warnings, selectedWarning]);

  const openHandleForm = (warning: CrisisWarning, toStatus: CrisisWarningStatus) => {
    setHandleForm({
      toStatus,
      handler: role === "supervisor" ? "王督导" : "李咨询师",
      description: "",
    });
    setIsHandling(true);
  };

  const submitHandle = () => {
    if (!handleForm || !selectedWarning) return;
    if (!handleForm.handler || !handleForm.description) return;
    const action: CrisisWarningAction = {
      id: "cwa" + nextCrisisWarningActionId++,
      fromStatus: selectedWarning.status,
      toStatus: handleForm.toStatus,
      handler: handleForm.handler,
      handledAt: new Date().toISOString(),
      description: handleForm.description,
    };
    const updated: CrisisWarning = {
      ...selectedWarning,
      status: handleForm.toStatus,
      actions: [...selectedWarning.actions, action],
      updatedAt: new Date().toISOString(),
    };
    onUpdateWarning(updated);
    setSelectedWarning(updated);
    setIsHandling(false);
    setHandleForm(null);
  };

  const cancelHandle = () => {
    setIsHandling(false);
    setHandleForm(null);
  };

  if (selectedWarning && !isHandling) {
    const canTransition = VALID_TRANSITIONS[selectedWarning.status];
    return (
      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>危机预警闭环</p>
            <h2>{selectedWarning.clientCode} — 预警详情</h2>
          </div>
          <button onClick={() => setSelectedWarning(null)}>返回列表</button>
        </div>

        <div className="cw-detail-header">
          <span className={`cw-status-badge ${crisisWarningStatusColors[selectedWarning.status]}`}>
            {crisisWarningStatusLabels[selectedWarning.status]}
          </span>
          <span className="cw-detail-trigger-type">
            {selectedWarning.triggerType === "risk_assessment" ? "风险评估触发" : "个案记录触发"}
          </span>
          <span className="cw-detail-time">
            创建于 {new Date(selectedWarning.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="cw-detail-info">
          <div className="cw-info-section">
            <h4>触发原因</h4>
            <p className="cw-reason-text">{selectedWarning.triggerReason}</p>
          </div>
        </div>

        {canTransition.length > 0 && (
          <div className="cw-action-bar">
            <span className="cw-action-label">状态操作：</span>
            {canTransition.map(target => (
              <button
                key={target}
                className={`cw-action-btn ${crisisWarningStatusColors[target]}`}
                onClick={() => openHandleForm(selectedWarning, target)}
              >
                {crisisWarningStatusLabels[target]}
              </button>
            ))}
          </div>
        )}

        {selectedWarning.actions.length > 0 && (
          <div className="cw-action-timeline">
            <h4>处理记录</h4>
            <div className="cw-action-list">
              {[...selectedWarning.actions].reverse().map(action => (
                <div key={action.id} className="cw-action-item">
                  <div className="cw-action-connector">
                    <span className={`cw-action-dot ${crisisWarningStatusColors[action.toStatus]}`} />
                  </div>
                  <div className="cw-action-body">
                    <div className="cw-action-header">
                      <span className={`cw-status-badge small ${crisisWarningStatusColors[action.fromStatus]}`}>
                        {crisisWarningStatusLabels[action.fromStatus]}
                      </span>
                      <span className="cw-action-arrow">→</span>
                      <span className={`cw-status-badge small ${crisisWarningStatusColors[action.toStatus]}`}>
                        {crisisWarningStatusLabels[action.toStatus]}
                      </span>
                      <span className="cw-action-handler">处理人：{action.handler}</span>
                    </div>
                    <p className="cw-action-desc">{action.description}</p>
                    <span className="cw-action-time">
                      {new Date(action.handledAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  if (isHandling && handleForm && selectedWarning) {
    return (
      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>危机预警闭环</p>
            <h2>处理预警 — {selectedWarning.clientCode}</h2>
          </div>
          <button onClick={cancelHandle}>返回详情</button>
        </div>

        <div className="cw-handle-form">
          <div className="cw-handle-info">
            <div className="cw-handle-transition">
              <span className={`cw-status-badge ${crisisWarningStatusColors[selectedWarning.status]}`}>
                {crisisWarningStatusLabels[selectedWarning.status]}
              </span>
              <span className="cw-action-arrow">→</span>
              <span className={`cw-status-badge ${crisisWarningStatusColors[handleForm.toStatus]}`}>
                {crisisWarningStatusLabels[handleForm.toStatus]}
              </span>
            </div>
            <p className="cw-handle-reason">触发原因：{selectedWarning.triggerReason}</p>
          </div>

          <div className="cw-handle-fields">
            <label>
              <span>处理人 *</span>
              <input
                value={handleForm.handler}
                onChange={e => setHandleForm({ ...handleForm, handler: e.target.value })}
                placeholder="填写处理人姓名"
              />
            </label>
            <label className="tl-form-full">
              <span>处理说明 *</span>
              <textarea
                value={handleForm.description}
                onChange={e => setHandleForm({ ...handleForm, description: e.target.value })}
                placeholder="描述处理情况、采取的措施和后续安排"
                rows={4}
              />
            </label>
          </div>

          <div className="tl-form-actions">
            <button onClick={cancelHandle}>取消</button>
            <button className="primary-action" onClick={submitHandle}>确认处理</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>危机预警闭环</p>
          <h2>预警看板</h2>
          <p className="section-subtitle">
            高风险评估或危机信号自动触发预警 · 同一个个案30分钟内不重复触发
          </p>
        </div>
      </div>

      <div className="cw-kanban-metrics">
        <div className="cw-kanban-metric cw-metric-pending">
          <span className="cw-kanban-value">{statusCounts.pending}</span>
          <span className="cw-kanban-label">待处理</span>
        </div>
        <div className="cw-kanban-metric cw-metric-confirmed">
          <span className="cw-kanban-value">{statusCounts.confirmed}</span>
          <span className="cw-kanban-label">已确认</span>
        </div>
        <div className="cw-kanban-metric cw-metric-escalated">
          <span className="cw-kanban-value">{statusCounts.escalated}</span>
          <span className="cw-kanban-label">已升级</span>
        </div>
        <div className="cw-kanban-metric cw-metric-referred">
          <span className="cw-kanban-value">{statusCounts.referred}</span>
          <span className="cw-kanban-label">已转介</span>
        </div>
        <div className="cw-kanban-metric cw-metric-closed">
          <span className="cw-kanban-value">{statusCounts.closed}</span>
          <span className="cw-kanban-label">已关闭</span>
        </div>
      </div>

      <div className="cw-filters">
        <div className="cw-status-tabs">
          {(["all", "pending", "confirmed", "escalated", "referred", "closed"] as const).map(s => (
            <button
              key={s}
              className={`cw-status-tab ${statusFilter === s ? "active" : ""} ${s !== "all" ? crisisWarningStatusColors[s] : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "全部" : crisisWarningStatusLabels[s]}
              <span className="cw-status-count">{statusCounts[s]}</span>
            </button>
          ))}
        </div>

        <div className="cw-client-filter">
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
          >
            <option value="all">全部来访者</option>
            {availableClientCodes.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cw-warning-list">
        {filteredWarnings.length === 0 && (
          <p className="tl-empty">暂无危机预警记录</p>
        )}
        {filteredWarnings.map(warning => (
          <article
            key={warning.id}
            className={`cw-warning-card ${warning.status === "pending" ? "cw-card-pulse" : ""}`}
            onClick={() => setSelectedWarning(warning)}
          >
            <div className="cw-card-left">
              <div className="cw-card-header">
                <h3 className="cw-card-client">{warning.clientCode}</h3>
                <span className={`cw-status-badge ${crisisWarningStatusColors[warning.status]}`}>
                  {crisisWarningStatusLabels[warning.status]}
                </span>
              </div>
              <p className="cw-card-reason">
                {warning.triggerReason.length > 80
                  ? warning.triggerReason.slice(0, 80) + "…"
                  : warning.triggerReason}
              </p>
              <div className="cw-card-meta">
                <span className="cw-card-trigger">
                  {warning.triggerType === "risk_assessment" ? "⚠️ 风险评估" : "📝 个案记录"}
                </span>
                <span className="cw-card-time">
                  {new Date(warning.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="cw-card-right">
              <div className="cw-card-actions-count">
                {warning.actions.length} 次处理
              </div>
              {warning.actions.length > 0 && (
                <span className="cw-card-last-handler">
                  最近：{warning.actions[warning.actions.length - 1].handler}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SupervisionWorkbench({
  records,
  role,
  onRoleChange,
  onAddRecord,
  onUpdateRecord,
  onSubmitForSupervision,
  onSaveDraft,
  onAddFeedback,
  crisisWarningByClient
}: {
  records: SupervisionRecord[];
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  onAddRecord: (record: SupervisionRecord) => void;
  onUpdateRecord: (record: SupervisionRecord) => void;
  onSubmitForSupervision: (record: SupervisionRecord) => void;
  onSaveDraft: (record: SupervisionRecord) => void;
  onAddFeedback: (recordId: string, feedback: SupervisionFeedback) => void;
  crisisWarningByClient: Map<string, CrisisWarningStatus>;
}) {
  const [selectedRecord, setSelectedRecord] = useState<SupervisionRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<SupervisionStatus | "all">(role === "supervisor" ? "pending" : "all");
  const [isEditing, setIsEditing] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SupervisionRecord | null>(null);
  const [isGivingFeedback, setIsGivingFeedback] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState<SupervisionFeedback | null>(null);
  const [viewingHistory, setViewingHistory] = useState(false);

  const filteredRecords = useMemo(() => {
    let filtered = records;
    if (statusFilter !== "all") {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [records, statusFilter]);

  const statusCounts = useMemo(() => ({
    all: records.length,
    draft: records.filter(r => r.status === "draft").length,
    pending: records.filter(r => r.status === "pending").length,
    feedback: records.filter(r => r.status === "feedback").length,
  }), [records]);

  useEffect(() => {
    if (selectedRecord) {
      const latest = records.find(r => r.id === selectedRecord.id);
      if (latest && JSON.stringify(latest) !== JSON.stringify(selectedRecord)) {
        setSelectedRecord(latest);
      }
    }
  }, [records, selectedRecord]);

  const openNewRecord = () => {
    const newRecord: SupervisionRecord = {
      id: "",
      clientCode: "",
      counselorName: "李咨询师",
      supervisorName: "王督导",
      consultationTopic: "",
      status: "draft",
      caseSummary: "",
      riskChanges: "",
      interventionGoals: "",
      sessionClips: [],
      feedbackHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingRecord(newRecord);
    setIsEditing(true);
  };

  const openEditRecord = (record: SupervisionRecord) => {
    if (record.status !== "draft") return;
    setEditingRecord({ ...record });
    setIsEditing(true);
  };

  const handleSaveDraft = () => {
    if (!editingRecord) return;
    if (!editingRecord.clientCode || !editingRecord.consultationTopic) return;
    const updated = { ...editingRecord, updatedAt: new Date().toISOString() };
    if (updated.id) {
      onUpdateRecord(updated);
      if (selectedRecord?.id === updated.id) {
        setSelectedRecord(updated);
      }
    } else {
      const newRecord = { ...updated, id: "sv" + nextSupervisionId++ };
      onAddRecord(newRecord);
    }
    setIsEditing(false);
    setEditingRecord(null);
  };

  const handleSubmitForSupervision = () => {
    if (!editingRecord) return;
    if (!editingRecord.clientCode || !editingRecord.consultationTopic || !editingRecord.caseSummary) return;
    const updated: SupervisionRecord = {
      ...editingRecord,
      status: "pending",
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (updated.id) {
      onSubmitForSupervision(updated);
      if (selectedRecord?.id === updated.id) {
        setSelectedRecord(updated);
      }
    } else {
      const newRecord = { ...updated, id: "sv" + nextSupervisionId++ };
      onAddRecord(newRecord);
    }
    setIsEditing(false);
    setEditingRecord(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingRecord(null);
  };

  const openFeedbackForm = (record: SupervisionRecord) => {
    const newFeedback: SupervisionFeedback = {
      id: "fb" + nextFeedbackId++,
      supervisorName: "王督导",
      feedbackDate: new Date().toISOString().slice(0, 10),
      caseConceptualization: "",
      interventionSuggestions: "",
      riskManagement: "",
      ethicalConsiderations: "",
      overallEvaluation: "",
      overallRating: 3,
    };
    setFeedbackForm(newFeedback);
    setIsGivingFeedback(true);
    setSelectedRecord(record);
  };

  const handleSaveFeedback = () => {
    if (!feedbackForm || !selectedRecord) return;
    if (!feedbackForm.caseConceptualization || !feedbackForm.interventionSuggestions) return;
    const updatedRecord: SupervisionRecord = {
      ...selectedRecord,
      status: "feedback",
      feedbackHistory: [...selectedRecord.feedbackHistory, feedbackForm],
      lastFeedbackAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSelectedRecord(updatedRecord);
    onAddFeedback(selectedRecord.id, feedbackForm);
    setIsGivingFeedback(false);
    setFeedbackForm(null);
  };

  const handleCancelFeedback = () => {
    setIsGivingFeedback(false);
    setFeedbackForm(null);
  };

  const updateEditingField = (field: keyof SupervisionRecord, value: string) => {
    if (!editingRecord) return;
    setEditingRecord({ ...editingRecord, [field]: value });
  };

  const updateFeedbackField = (field: keyof SupervisionFeedback, value: string | number) => {
    if (!feedbackForm) return;
    setFeedbackForm({ ...feedbackForm, [field]: value });
  };

  const addSessionClip = () => {
    if (!editingRecord) return;
    const newClip: SessionClip = {
      id: "clip" + nextClipId++,
      timestamp: "",
      description: "",
      transcript: "",
    };
    setEditingRecord({
      ...editingRecord,
      sessionClips: [...editingRecord.sessionClips, newClip],
    });
  };

  const updateClip = (clipId: string, field: keyof SessionClip, value: string) => {
    if (!editingRecord) return;
    setEditingRecord({
      ...editingRecord,
      sessionClips: editingRecord.sessionClips.map(c =>
        c.id === clipId ? { ...c, [field]: value } : c
      ),
    });
  };

  const removeClip = (clipId: string) => {
    if (!editingRecord) return;
    setEditingRecord({
      ...editingRecord,
      sessionClips: editingRecord.sessionClips.filter(c => c.id !== clipId),
    });
  };

  const renderStars = (rating: number, interactive = false, onChange?: (r: number) => void) => {
    return (
      <div className="star-rating">
        {[1, 2, 3, 4, 5].map(star => (
          <span
            key={star}
            className={`star ${star <= rating ? "filled" : ""} ${interactive ? "interactive" : ""}`}
            onClick={() => interactive && onChange && onChange(star)}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  if (isEditing && editingRecord && role === "counselor") {
    return (
      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>督导评审</p>
            <h2>{editingRecord.id ? "编辑督导申请" : "新建督导申请"}</h2>
          </div>
          <button onClick={handleCancelEdit}>返回列表</button>
        </div>

        <div className="sup-edit-form">
          <div className="tl-form-grid">
            <label>
              <span>来访者代号 *</span>
              <input
                value={editingRecord.clientCode}
                onChange={e => updateEditingField("clientCode", e.target.value)}
                placeholder="例如：C-042"
              />
            </label>
            <label>
              <span>咨询主题 *</span>
              <input
                value={editingRecord.consultationTopic}
                onChange={e => updateEditingField("consultationTopic", e.target.value)}
                placeholder="例如：焦虑障碍"
              />
            </label>
            <label>
              <span>咨询师</span>
              <input value={editingRecord.counselorName} disabled />
            </label>
            <label>
              <span>督导</span>
              <input value={editingRecord.supervisorName} disabled />
            </label>
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">个案摘要</h3>
            <textarea
              className="sup-textarea"
              value={editingRecord.caseSummary}
              onChange={e => updateEditingField("caseSummary", e.target.value)}
              placeholder="请详细描述个案背景、来访原因、主要症状等"
              rows={5}
            />
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">风险变化</h3>
            <textarea
              className="sup-textarea"
              value={editingRecord.riskChanges}
              onChange={e => updateEditingField("riskChanges", e.target.value)}
              placeholder="描述风险等级的变化趋势、关键维度的变化及原因"
              rows={4}
            />
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">干预目标</h3>
            <textarea
              className="sup-textarea"
              value={editingRecord.interventionGoals}
              onChange={e => updateEditingField("interventionGoals", e.target.value)}
              placeholder="列出当前的干预目标及其进展情况"
              rows={4}
            />
          </div>

          <div className="sup-section">
            <div className="sup-section-header">
              <h3 className="sup-section-title">会谈片段</h3>
              <button className="secondary-btn" onClick={addSessionClip}>添加片段</button>
            </div>
            {editingRecord.sessionClips.length === 0 && (
              <p className="tl-empty">暂不会谈片段，点击"添加片段"开始录入</p>
            )}
            {editingRecord.sessionClips.map((clip, index) => (
              <div key={clip.id} className="clip-edit-card">
                <div className="clip-edit-header">
                  <span className="clip-index">片段 {index + 1}</span>
                  <button className="tl-btn-danger" onClick={() => removeClip(clip.id)}>删除</button>
                </div>
                <div className="tl-form-grid">
                  <label className="tl-form-full">
                    <span>时间标记</span>
                    <input
                      value={clip.timestamp}
                      onChange={e => updateClip(clip.id, "timestamp", e.target.value)}
                      placeholder="例如：第3次会谈 25:30"
                    />
                  </label>
                  <label className="tl-form-full">
                    <span>片段描述</span>
                    <input
                      value={clip.description}
                      onChange={e => updateClip(clip.id, "description", e.target.value)}
                      placeholder="简要描述这个片段的内容"
                    />
                  </label>
                  <label className="tl-form-full">
                    <span>对话内容</span>
                    <textarea
                      value={clip.transcript}
                      onChange={e => updateClip(clip.id, "transcript", e.target.value)}
                      placeholder="录入选段的对话内容"
                      rows={4}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="sup-edit-actions">
            <button onClick={handleCancelEdit}>取消</button>
            <button onClick={handleSaveDraft}>保存草稿</button>
            <button className="primary-action" onClick={handleSubmitForSupervision}>提交督导</button>
          </div>
        </div>
      </section>
    );
  }

  if (isGivingFeedback && feedbackForm && selectedRecord && role === "supervisor") {
    return (
      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>督导评审</p>
            <h2>给出督导意见 — {selectedRecord.clientCode}</h2>
          </div>
          <button onClick={handleCancelFeedback}>返回详情</button>
        </div>

        <div className="sup-feedback-form">
          <div className="sup-feedback-case-info">
            <div className="case-info-item">
              <span className="case-info-label">来访者</span>
              <strong>{selectedRecord.clientCode}</strong>
            </div>
            <div className="case-info-item">
              <span className="case-info-label">咨询主题</span>
              <strong>{selectedRecord.consultationTopic}</strong>
            </div>
            <div className="case-info-item">
              <span className="case-info-label">咨询师</span>
              <strong>{selectedRecord.counselorName}</strong>
            </div>
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">个案概念化评价</h3>
            <textarea
              className="sup-textarea"
              value={feedbackForm.caseConceptualization}
              onChange={e => updateFeedbackField("caseConceptualization", e.target.value)}
              placeholder="评价咨询师对个案的理解和概念化是否准确"
              rows={4}
            />
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">干预技术建议</h3>
            <textarea
              className="sup-textarea"
              value={feedbackForm.interventionSuggestions}
              onChange={e => updateFeedbackField("interventionSuggestions", e.target.value)}
              placeholder="针对干预方法的具体建议和改进方向"
              rows={5}
            />
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">风险管理指导</h3>
            <textarea
              className="sup-textarea"
              value={feedbackForm.riskManagement}
              onChange={e => updateFeedbackField("riskManagement", e.target.value)}
              placeholder="关于风险评估和管理的指导意见"
              rows={4}
            />
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">伦理议题讨论</h3>
            <textarea
              className="sup-textarea"
              value={feedbackForm.ethicalConsiderations}
              onChange={e => updateFeedbackField("ethicalConsiderations", e.target.value)}
              placeholder="相关的伦理议题和注意事项"
              rows={3}
            />
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">总体评价</h3>
            <textarea
              className="sup-textarea"
              value={feedbackForm.overallEvaluation}
              onChange={e => updateFeedbackField("overallEvaluation", e.target.value)}
              placeholder="对本次咨询的总体评价和后续建议"
              rows={3}
            />
          </div>

          <div className="sup-section">
            <h3 className="sup-section-title">综合评分</h3>
            <div className="sup-rating-row">
              {renderStars(feedbackForm.overallRating, true, (r) => updateFeedbackField("overallRating", r))}
              <span className="rating-text">{feedbackForm.overallRating} / 5</span>
            </div>
          </div>

          <div className="sup-edit-actions">
            <button onClick={handleCancelFeedback}>取消</button>
            <button className="primary-action" onClick={handleSaveFeedback}>提交督导意见</button>
          </div>
        </div>
      </section>
    );
  }

  if (selectedRecord) {
    const latestFeedback = selectedRecord.feedbackHistory.length > 0
      ? selectedRecord.feedbackHistory[selectedRecord.feedbackHistory.length - 1]
      : null;

    return (
      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>督导评审</p>
            <h2>{selectedRecord.clientCode} — {selectedRecord.consultationTopic}</h2>
            <p className="section-subtitle">
              咨询师：{selectedRecord.counselorName} · 督导：{selectedRecord.supervisorName}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setSelectedRecord(null)}>返回列表</button>
            {role === "counselor" && selectedRecord.status === "draft" && (
              <button className="primary-action" onClick={() => openEditRecord(selectedRecord)}>编辑</button>
            )}
            {role === "supervisor" && selectedRecord.status === "pending" && (
              <button className="primary-action" onClick={() => openFeedbackForm(selectedRecord)}>给出督导意见</button>
            )}
          </div>
        </div>

        <div className="sup-detail-status">
          <span className={`sup-status-badge ${supervisionStatusColors[selectedRecord.status]}`}>
            {supervisionStatusLabels[selectedRecord.status]}
          </span>
          {selectedRecord.submittedAt && (
            <span className="sup-status-meta">提交于 {new Date(selectedRecord.submittedAt).toLocaleDateString()}</span>
          )}
          {selectedRecord.lastFeedbackAt && (
            <span className="sup-status-meta">上次反馈 {new Date(selectedRecord.lastFeedbackAt).toLocaleDateString()}</span>
          )}
        </div>

        <div className="sup-detail-grid">
          <div className="sup-detail-col">
            <div className="sup-section">
              <h3 className="sup-section-title">个案摘要</h3>
              <p className="sup-detail-text">{selectedRecord.caseSummary || "暂无内容"}</p>
            </div>

            <div className="sup-section">
              <h3 className="sup-section-title">风险变化</h3>
              <p className="sup-detail-text">{selectedRecord.riskChanges || "暂无内容"}</p>
            </div>

            <div className="sup-section">
              <h3 className="sup-section-title">干预目标</h3>
              <p className="sup-detail-text sup-pre-wrap">{selectedRecord.interventionGoals || "暂无内容"}</p>
            </div>
          </div>

          <div className="sup-detail-col">
            <div className="sup-section">
              <div className="sup-section-header">
                <h3 className="sup-section-title">会谈片段</h3>
                <span className="sup-count-badge">{selectedRecord.sessionClips.length} 段</span>
              </div>
              {selectedRecord.sessionClips.length === 0 && (
                <p className="tl-empty">暂不会谈片段</p>
              )}
              {selectedRecord.sessionClips.map(clip => (
                <div key={clip.id} className="clip-view-card">
                  <div className="clip-view-header">
                    <span className="clip-timestamp">{clip.timestamp}</span>
                  </div>
                  <p className="clip-description">{clip.description}</p>
                  <div className="clip-transcript">
                    <p className="clip-transcript-label">对话内容</p>
                    <p className="clip-transcript-text">{clip.transcript}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {latestFeedback && !viewingHistory && (
          <div className="sup-section">
            <div className="sup-section-header">
              <h3 className="sup-section-title">最新督导意见</h3>
              {selectedRecord.feedbackHistory.length > 1 && (
                <button className="text-btn" onClick={() => setViewingHistory(true)}>
                  查看全部历史 ({selectedRecord.feedbackHistory.length} 条)
                </button>
              )}
            </div>
            <div className="feedback-card">
              <div className="feedback-header">
                <div className="feedback-author">
                  <span className="feedback-name">{latestFeedback.supervisorName}</span>
                  <span className="feedback-date">{latestFeedback.feedbackDate}</span>
                </div>
                {renderStars(latestFeedback.overallRating)}
              </div>
              <div className="feedback-body">
                <div className="feedback-section">
                  <h4>个案概念化</h4>
                  <p>{latestFeedback.caseConceptualization}</p>
                </div>
                <div className="feedback-section">
                  <h4>干预技术建议</h4>
                  <p className="sup-pre-wrap">{latestFeedback.interventionSuggestions}</p>
                </div>
                <div className="feedback-section">
                  <h4>风险管理指导</h4>
                  <p className="sup-pre-wrap">{latestFeedback.riskManagement}</p>
                </div>
                <div className="feedback-section">
                  <h4>伦理议题</h4>
                  <p className="sup-pre-wrap">{latestFeedback.ethicalConsiderations}</p>
                </div>
                <div className="feedback-section">
                  <h4>总体评价</h4>
                  <p>{latestFeedback.overallEvaluation}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewingHistory && (
          <div className="sup-section">
            <div className="sup-section-header">
              <h3 className="sup-section-title">督导历史记录</h3>
              <button className="text-btn" onClick={() => setViewingHistory(false)}>返回最新</button>
            </div>
            <div className="feedback-history-list">
              {[...selectedRecord.feedbackHistory].reverse().map((fb, index) => (
                <div key={fb.id} className="feedback-history-item">
                  <div className="feedback-history-version">
                    <span className="version-badge">v{selectedRecord.feedbackHistory.length - index}</span>
                    <span className="version-date">{fb.feedbackDate}</span>
                  </div>
                  <div className="feedback-card history">
                    <div className="feedback-header">
                      <div className="feedback-author">
                        <span className="feedback-name">{fb.supervisorName}</span>
                      </div>
                      {renderStars(fb.overallRating)}
                    </div>
                    <div className="feedback-body">
                      <div className="feedback-section">
                        <h4>个案概念化</h4>
                        <p>{fb.caseConceptualization}</p>
                      </div>
                      <div className="feedback-section">
                        <h4>干预技术建议</h4>
                        <p className="sup-pre-wrap">{fb.interventionSuggestions}</p>
                      </div>
                      <div className="feedback-section">
                        <h4>风险管理指导</h4>
                        <p className="sup-pre-wrap">{fb.riskManagement}</p>
                      </div>
                      <div className="feedback-section">
                        <h4>伦理议题</h4>
                        <p className="sup-pre-wrap">{fb.ethicalConsiderations}</p>
                      </div>
                      <div className="feedback-section">
                        <h4>总体评价</h4>
                        <p>{fb.overallEvaluation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>督导评审工作台</p>
          <h2>{role === "supervisor" ? "待评审个案" : "我的督导申请"}</h2>
          <p className="section-subtitle">
            共 {records.length} 条督导记录
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <div className="role-switcher">
            <button
              className={`role-btn ${role === "counselor" ? "active" : ""}`}
              onClick={() => { onRoleChange("counselor"); setStatusFilter("all"); }}
            >
              咨询师视角
            </button>
            <button
              className={`role-btn ${role === "supervisor" ? "active" : ""}`}
              onClick={() => { onRoleChange("supervisor"); setStatusFilter("pending"); }}
            >
              督导视角
            </button>
          </div>
          {role === "counselor" && (
            <button className="primary-action" onClick={openNewRecord}>新建申请</button>
          )}
        </div>
      </div>

      <div className="sup-status-tabs">
        {(role === "supervisor"
          ? (["pending", "feedback", "draft"] as const)
          : (["all", "draft", "pending", "feedback"] as const)
        ).map(status => (
          <button
            key={status}
            className={`sup-status-tab ${statusFilter === status ? "active" : ""} ${status !== "all" ? supervisionStatusColors[status as SupervisionStatus] : ""}`}
            onClick={() => setStatusFilter(status as SupervisionStatus | "all")}
          >
            {status === "all" ? "全部" : supervisionStatusLabels[status as SupervisionStatus]}
            <span className="sup-status-count">
              {status === "all" ? statusCounts.all : statusCounts[status as SupervisionStatus]}
            </span>
          </button>
        ))}
      </div>

      <div className="sup-record-list">
        {filteredRecords.length === 0 && (
          <p className="tl-empty">
            {statusFilter === "all"
              ? "暂无督导记录"
              : `暂无${supervisionStatusLabels[statusFilter as SupervisionStatus]}的记录`}
          </p>
        )}
        {filteredRecords.map(record => (
          <article key={record.id} className="sup-record-card" onClick={() => setSelectedRecord(record)}>
            <div className="sup-record-left">
              <div className="sup-record-header">
                <h3 className="sup-record-title">{record.clientCode}</h3>
                <span className={`sup-status-badge ${supervisionStatusColors[record.status]}`}>
                  {supervisionStatusLabels[record.status]}
                </span>
                {crisisWarningByClient.has(record.clientCode) && (
                  <span className="cw-indicator-badge">
                    🚨 {crisisWarningStatusLabels[crisisWarningByClient.get(record.clientCode)!]}
                  </span>
                )}
              </div>
              <p className="sup-record-topic">{record.consultationTopic}</p>
              <p className="sup-record-summary">
                {record.caseSummary?.slice(0, 100) || "暂无摘要"}
                {record.caseSummary?.length > 100 ? "..." : ""}
              </p>
            </div>
            <div className="sup-record-right">
              <div className="sup-record-meta">
                <span>咨询师：{record.counselorName}</span>
                <span>片段：{record.sessionClips.length} 段</span>
                <span>反馈：{record.feedbackHistory.length} 条</span>
              </div>
              <div className="sup-record-date">
                更新于 {new Date(record.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

interface OverviewFilters {
  startDate: string;
  endDate: string;
  topics: string[];
  riskLevels: RiskLevel[];
}

interface TopicSummary {
  topic: string;
  caseCount: number;
  sessionCount: number;
}

interface RiskSummary {
  level: RiskLevel;
  label: string;
  caseCount: number;
  percentage: number;
}

interface SessionFrequencyItem {
  range: string;
  caseCount: number;
  percentage: number;
}

interface GoalCompletionSummary {
  totalGoals: number;
  completedGoals: number;
  activeGoals: number;
  pausedGoals: number;
  completionRate: number;
  avgProgress: number;
}

interface OverviewSummaryData {
  totalCases: number;
  totalSessions: number;
  topicDistribution: TopicSummary[];
  riskDistribution: RiskSummary[];
  sessionFrequency: SessionFrequencyItem[];
  goalCompletion: GoalCompletionSummary;
}

function DataOverviewSection({
  timeline,
  assessments,
  goals,
  caseRecords,
}: {
  timeline: TimelineRecord[];
  assessments: RiskAssessment[];
  goals: InterventionGoal[];
  caseRecords: CaseRecord[];
}) {
  const allTopics = useMemo(() => {
    const topics = new Set<string>();
    caseRecords.forEach(r => r.consultationTopic && topics.add(r.consultationTopic));
    timeline.forEach(r => r.topic && topics.add(r.topic));
    return Array.from(topics).sort();
  }, [caseRecords, timeline]);

  const [filters, setFilters] = useState<OverviewFilters>({
    startDate: "",
    endDate: "",
    topics: [],
    riskLevels: [],
  });

  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const [showRiskDropdown, setShowRiskDropdown] = useState(false);

  const filteredClientCodes = useMemo(() => {
    let codes = new Set<string>();

    caseRecords.forEach(r => codes.add(r.clientCode));
    timeline.forEach(r => codes.add(r.clientCode));
    assessments.forEach(r => codes.add(r.clientCode));
    goals.forEach(r => codes.add(r.clientCode));

    if (filters.startDate) {
      const start = new Date(filters.startDate);
      const filteredByDate = new Set<string>();
      timeline.forEach(r => {
        if (r.sessionDate && new Date(r.sessionDate) >= start) filteredByDate.add(r.clientCode);
      });
      caseRecords.forEach(r => {
        if (r.sessionDate && new Date(r.sessionDate) >= start) filteredByDate.add(r.clientCode);
      });
      assessments.forEach(r => {
        if (r.assessDate && new Date(r.assessDate) >= start) filteredByDate.add(r.clientCode);
      });
      if (filters.startDate || filters.endDate) {
        codes = new Set([...codes].filter(c => filteredByDate.has(c)));
      }
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      const filteredByDate = new Set<string>();
      timeline.forEach(r => {
        if (r.sessionDate && new Date(r.sessionDate) <= end) filteredByDate.add(r.clientCode);
      });
      caseRecords.forEach(r => {
        if (r.sessionDate && new Date(r.sessionDate) <= end) filteredByDate.add(r.clientCode);
      });
      assessments.forEach(r => {
        if (r.assessDate && new Date(r.assessDate) <= end) filteredByDate.add(r.clientCode);
      });
      codes = new Set([...codes].filter(c => filteredByDate.has(c)));
    }

    if (filters.topics.length > 0) {
      const topicClients = new Set<string>();
      caseRecords.forEach(r => {
        if (filters.topics.includes(r.consultationTopic)) topicClients.add(r.clientCode);
      });
      timeline.forEach(r => {
        if (filters.topics.includes(r.topic)) topicClients.add(r.clientCode);
      });
      codes = new Set([...codes].filter(c => topicClients.has(c)));
    }

    if (filters.riskLevels.length > 0) {
      const riskClients = new Set<string>();
      const latestByClient = new Map<string, RiskAssessment>();
      assessments.forEach(a => {
        const existing = latestByClient.get(a.clientCode);
        if (!existing || existing.assessDate < a.assessDate) {
          latestByClient.set(a.clientCode, a);
        }
      });
      latestByClient.forEach((a, code) => {
        if (filters.riskLevels.includes(a.level)) riskClients.add(code);
      });
      codes = new Set([...codes].filter(c => riskClients.has(c)));
    }

    return Array.from(codes).sort();
  }, [timeline, assessments, goals, caseRecords, filters]);

  const summaryData = useMemo<OverviewSummaryData>(() => {
    const inDateRange = (dateStr: string | undefined): boolean => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (filters.startDate && d < new Date(filters.startDate)) return false;
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    };

    const hasDateFilter = !!filters.startDate || !!filters.endDate;

    const timelineInRange = timeline.filter(r => {
      if (!filteredClientCodes.includes(r.clientCode)) return false;
      if (hasDateFilter) return inDateRange(r.sessionDate);
      return true;
    });

    const caseRecordsInRange = caseRecords.filter(r => {
      if (!filteredClientCodes.includes(r.clientCode)) return false;
      if (hasDateFilter) return inDateRange(r.sessionDate);
      return true;
    });

    const assessmentsInRange = assessments.filter(r => {
      if (!filteredClientCodes.includes(r.clientCode)) return false;
      if (hasDateFilter) return inDateRange(r.assessDate);
      return true;
    });

    const goalsInRange = goals.filter(r => {
      if (!filteredClientCodes.includes(r.clientCode)) return false;
      if (hasDateFilter) return inDateRange(r.createdAt) || inDateRange(r.lastActionDate);
      return true;
    });

    const topicMap = new Map<string, { caseCount: number; sessionCount: number }>();
    const topicClients = new Map<string, Set<string>>();

    caseRecordsInRange.forEach(r => {
      if (r.consultationTopic) {
        if (!topicMap.has(r.consultationTopic)) {
          topicMap.set(r.consultationTopic, { caseCount: 0, sessionCount: 0 });
          topicClients.set(r.consultationTopic, new Set());
        }
        const data = topicMap.get(r.consultationTopic)!;
        const clients = topicClients.get(r.consultationTopic)!;
        if (!clients.has(r.clientCode)) {
          clients.add(r.clientCode);
          data.caseCount++;
        }
        data.sessionCount++;
      }
    });

    timelineInRange.forEach(r => {
      if (r.topic) {
        if (!topicMap.has(r.topic)) {
          topicMap.set(r.topic, { caseCount: 0, sessionCount: 0 });
          topicClients.set(r.topic, new Set());
        }
        const data = topicMap.get(r.topic)!;
        const clients = topicClients.get(r.topic)!;
        if (!clients.has(r.clientCode)) {
          clients.add(r.clientCode);
          data.caseCount++;
        }
        data.sessionCount++;
      }
    });

    const topicDistribution: TopicSummary[] = Array.from(topicMap.entries())
      .map(([topic, data]) => ({ topic, ...data }))
      .sort((a, b) => b.caseCount - a.caseCount);

    const latestByClientInRange = new Map<string, RiskAssessment>();
    if (hasDateFilter) {
      assessmentsInRange.forEach(a => {
        const existing = latestByClientInRange.get(a.clientCode);
        if (!existing || existing.assessDate < a.assessDate) {
          latestByClientInRange.set(a.clientCode, a);
        }
      });
    } else {
      const latestByClientGlobal = new Map<string, RiskAssessment>();
      assessments
        .filter(r => filteredClientCodes.includes(r.clientCode))
        .forEach(a => {
          const existing = latestByClientGlobal.get(a.clientCode);
          if (!existing || existing.assessDate < a.assessDate) {
            latestByClientGlobal.set(a.clientCode, a);
          }
        });
      assessments
        .filter(r => filteredClientCodes.includes(r.clientCode))
        .forEach(a => {
          if (latestByClientGlobal.get(a.clientCode)?.id === a.id) {
            latestByClientInRange.set(a.clientCode, a);
          }
        });
    }

    const riskCounts: Record<RiskLevel, number> = { stable: 0, watch: 0, medium: 0, high: 0 };
    latestByClientInRange.forEach(a => {
      riskCounts[a.level]++;
    });

    const totalWithRisk = latestByClientInRange.size;
    const riskDistribution: RiskSummary[] = (["high", "medium", "watch", "stable"] as RiskLevel[]).map(level => ({
      level,
      label: riskLevelLabels[level],
      caseCount: riskCounts[level],
      percentage: totalWithRisk > 0 ? Math.round((riskCounts[level] / totalWithRisk) * 100) : 0,
    }));

    const sessionCountsByClient = new Map<string, number>();
    timelineInRange.forEach(r => {
      sessionCountsByClient.set(r.clientCode, (sessionCountsByClient.get(r.clientCode) || 0) + 1);
    });
    caseRecordsInRange.forEach(r => {
      sessionCountsByClient.set(r.clientCode, (sessionCountsByClient.get(r.clientCode) || 0) + 1);
    });

    const frequencyRanges = [
      { range: "1-2次", min: 1, max: 2, count: 0 },
      { range: "3-5次", min: 3, max: 5, count: 0 },
      { range: "6-10次", min: 6, max: 10, count: 0 },
      { range: "10次以上", min: 11, max: Infinity, count: 0 },
    ];

    const totalClientsWithSessions = sessionCountsByClient.size;
    sessionCountsByClient.forEach(count => {
      for (const range of frequencyRanges) {
        if (count >= range.min && count <= range.max) {
          range.count++;
          break;
        }
      }
    });

    const sessionFrequency: SessionFrequencyItem[] = frequencyRanges.map(r => ({
      range: r.range,
      caseCount: r.count,
      percentage: totalClientsWithSessions > 0 ? Math.round((r.count / totalClientsWithSessions) * 100) : 0,
    }));

    const totalGoals = goalsInRange.length;
    const completedGoals = goalsInRange.filter(g => g.status === "completed").length;
    const activeGoals = goalsInRange.filter(g => g.status === "active").length;
    const pausedGoals = goalsInRange.filter(g => g.status === "paused").length;
    const totalSteps = goalsInRange.reduce((s, g) => s + g.totalSteps, 0);
    const completedSteps = goalsInRange.reduce((s, g) => s + g.completedSteps, 0);

    const goalCompletion: GoalCompletionSummary = {
      totalGoals,
      completedGoals,
      activeGoals,
      pausedGoals,
      completionRate: totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0,
      avgProgress: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
    };

    const summaryClientCodes = new Set<string>();
    timelineInRange.forEach(r => summaryClientCodes.add(r.clientCode));
    caseRecordsInRange.forEach(r => summaryClientCodes.add(r.clientCode));
    assessmentsInRange.forEach(r => summaryClientCodes.add(r.clientCode));
    goalsInRange.forEach(r => summaryClientCodes.add(r.clientCode));

    return {
      totalCases: summaryClientCodes.size,
      totalSessions: timelineInRange.length + caseRecordsInRange.length,
      topicDistribution,
      riskDistribution,
      sessionFrequency,
      goalCompletion,
    };
  }, [filteredClientCodes, timeline, assessments, goals, caseRecords, filters]);

  const toggleTopic = (topic: string) => {
    setFilters(prev => ({
      ...prev,
      topics: prev.topics.includes(topic)
        ? prev.topics.filter(t => t !== topic)
        : [...prev.topics, topic],
    }));
  };

  const toggleRiskLevel = (level: RiskLevel) => {
    setFilters(prev => ({
      ...prev,
      riskLevels: prev.riskLevels.includes(level)
        ? prev.riskLevels.filter(l => l !== level)
        : [...prev.riskLevels, level],
    }));
  };

  const resetFilters = () => {
    setFilters({
      startDate: "",
      endDate: "",
      topics: [],
      riskLevels: [],
    });
  };

  const hasActiveFilters = filters.startDate || filters.endDate || filters.topics.length > 0 || filters.riskLevels.length > 0;

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>机构管理</p>
          <h2>数据总览</h2>
          <p className="section-subtitle">
            按咨询主题、风险等级、会谈频次和目标完成情况汇总 · 不展示来访者详细困扰文本
          </p>
        </div>
        {hasActiveFilters && (
          <button className="secondary-action" onClick={resetFilters}>重置筛选</button>
        )}
      </div>

      <div className="overview-filters">
        <div className="filter-group">
          <label className="filter-label">时间范围</label>
          <div className="date-range-inputs">
            <input
              type="date"
              value={filters.startDate}
              onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              placeholder="开始日期"
            />
            <span className="date-separator">至</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              placeholder="结束日期"
            />
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">咨询主题</label>
          <div className="multi-select-wrapper">
            <button
              className="multi-select-trigger"
              onClick={() => { setShowTopicDropdown(!showTopicDropdown); setShowRiskDropdown(false); }}
            >
              {filters.topics.length === 0
                ? "全部主题"
                : `已选 ${filters.topics.length} 个主题`}
              <span className="dropdown-arrow">▼</span>
            </button>
            {showTopicDropdown && (
              <div className="multi-select-dropdown">
                {allTopics.length === 0 && <div className="dropdown-empty">暂无主题</div>}
                {allTopics.map(topic => (
                  <label key={topic} className="dropdown-option">
                    <input
                      type="checkbox"
                      checked={filters.topics.includes(topic)}
                      onChange={() => toggleTopic(topic)}
                    />
                    <span>{topic}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">风险等级</label>
          <div className="multi-select-wrapper">
            <button
              className="multi-select-trigger"
              onClick={() => { setShowRiskDropdown(!showRiskDropdown); setShowTopicDropdown(false); }}
            >
              {filters.riskLevels.length === 0
                ? "全部等级"
                : `已选 ${filters.riskLevels.length} 个等级`}
              <span className="dropdown-arrow">▼</span>
            </button>
            {showRiskDropdown && (
              <div className="multi-select-dropdown">
                {(["high", "medium", "watch", "stable"] as RiskLevel[]).map(level => (
                  <label key={level} className="dropdown-option">
                    <input
                      type="checkbox"
                      checked={filters.riskLevels.includes(level)}
                      onChange={() => toggleRiskLevel(level)}
                    />
                    <span className={`risk-badge-inline ${riskLevelColors[level]}`}>
                      {riskLevelLabels[level]}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overview-metrics">
        <div className="overview-metric-card">
          <span className="overview-metric-label">总个案数</span>
          <strong className="overview-metric-value">{summaryData.totalCases}</strong>
        </div>
        <div className="overview-metric-card">
          <span className="overview-metric-label">总会谈数</span>
          <strong className="overview-metric-value">{summaryData.totalSessions}</strong>
        </div>
        <div className="overview-metric-card">
          <span className="overview-metric-label">咨询主题</span>
          <strong className="overview-metric-value">{summaryData.topicDistribution.length}</strong>
        </div>
        <div className="overview-metric-card">
          <span className="overview-metric-label">目标完成率</span>
          <strong className="overview-metric-value">{summaryData.goalCompletion.completionRate}%</strong>
        </div>
      </div>

      <div className="overview-grid">
        <div className="overview-panel">
          <h3 className="overview-panel-title">咨询主题分布</h3>
          {summaryData.topicDistribution.length === 0 ? (
            <p className="tl-empty">暂无数据</p>
          ) : (
            <div className="topic-distribution-list">
              {summaryData.topicDistribution.map(item => (
                <div key={item.topic} className="topic-dist-item">
                  <div className="topic-dist-header">
                    <span className="topic-dist-name">{item.topic}</span>
                    <span className="topic-dist-count">{item.caseCount} 个个案</span>
                  </div>
                  <div className="topic-dist-bar">
                    <div
                      className="topic-dist-fill"
                      style={{
                        width: `${summaryData.totalCases > 0 ? (item.caseCount / summaryData.totalCases) * 100 : 0}%`
                      }}
                    />
                  </div>
                  <div className="topic-dist-meta">
                    <span>{item.sessionCount} 次会谈</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overview-panel">
          <h3 className="overview-panel-title">风险等级分布</h3>
          <div className="risk-distribution-list">
            {summaryData.riskDistribution.map(item => (
              <div key={item.level} className="risk-dist-item">
                <div className="risk-dist-header">
                  <span className={`risk-dot ${riskLevelColors[item.level]}`} />
                  <span className="risk-dist-label">{item.label}</span>
                  <span className="risk-dist-count">{item.caseCount} 人</span>
                  <span className="risk-dist-percent">{item.percentage}%</span>
                </div>
                <div className="risk-dist-bar">
                  <div
                    className={`risk-dist-fill ${riskLevelColors[item.level]}`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="overview-note">
            基于最新一次风险评估统计
          </div>
        </div>

        <div className="overview-panel">
          <h3 className="overview-panel-title">会谈频次分布</h3>
          {summaryData.sessionFrequency.every(s => s.caseCount === 0) ? (
            <p className="tl-empty">暂无数据</p>
          ) : (
            <div className="frequency-distribution-list">
              {summaryData.sessionFrequency.map(item => (
                <div key={item.range} className="freq-dist-item">
                  <div className="freq-dist-header">
                    <span className="freq-dist-range">{item.range}</span>
                    <span className="freq-dist-count">{item.caseCount} 个个案</span>
                  </div>
                  <div className="freq-dist-bar">
                    <div
                      className="freq-dist-fill"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className="freq-dist-percent">{item.percentage}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overview-panel">
          <h3 className="overview-panel-title">目标完成情况</h3>
          <div className="goal-overview-stats">
            <div className="goal-overview-stat">
              <span className="goal-overview-label">总目标数</span>
              <strong className="goal-overview-value">{summaryData.goalCompletion.totalGoals}</strong>
            </div>
            <div className="goal-overview-stat">
              <span className="goal-overview-label">已完成</span>
              <strong className="goal-overview-value goal-completed-text">
                {summaryData.goalCompletion.completedGoals}
              </strong>
            </div>
            <div className="goal-overview-stat">
              <span className="goal-overview-label">进行中</span>
              <strong className="goal-overview-value goal-active-text">
                {summaryData.goalCompletion.activeGoals}
              </strong>
            </div>
            <div className="goal-overview-stat">
              <span className="goal-overview-label">已暂停</span>
              <strong className="goal-overview-value goal-paused-text">
                {summaryData.goalCompletion.pausedGoals}
              </strong>
            </div>
          </div>
          <div className="goal-overview-progress">
            <div className="goal-overview-progress-label">
              <span>总体进度</span>
              <span>{summaryData.goalCompletion.avgProgress}%</span>
            </div>
            <div className="goal-progress-bar">
              <div
                className="goal-progress-fill"
                style={{ width: `${summaryData.goalCompletion.avgProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface CaseSearchFilters {
  clientCode: string;
  consultationTopic: string;
  riskLevel: RiskLevel | "";
  crisisWarningStatus: CrisisWarningStatus | "";
  emotionalState: string;
  intervention: string;
  nextGoal: string;
  keyword: string;
}

interface SavedFilterView {
  id: string;
  name: string;
  filters: Omit<CaseSearchFilters, "clientCode"> & { clientCode?: string };
  createdAt: string;
}

interface Toast {
  id: number;
  message: string;
  type: "error" | "success" | "info";
}

const SAVED_VIEWS_STORAGE_KEY = "hxwl12_saved_filter_views";

function loadSavedViews(): SavedFilterView[] {
  try {
    const data = localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSavedViews(views: SavedFilterView[]): void {
  try {
    localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
  } catch {
    console.error("Failed to save filter views");
  }
}

function CaseSearchFilter({
  filters,
  onFiltersChange,
  onReset,
  resultCount,
  totalCount,
  allClientCodes,
  allTopics,
  allEmotionalStates,
  allInterventions,
  showToast,
}: {
  filters: CaseSearchFilters;
  onFiltersChange: (filters: CaseSearchFilters) => void;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
  allClientCodes: string[];
  allTopics: string[];
  allEmotionalStates: string[];
  allInterventions: string[];
  showToast: (message: string, type?: "error" | "success" | "info") => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedFilterView[]>(() => loadSavedViews());
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [showViewManager, setShowViewManager] = useState(false);

  const hasActiveFilters = filters.clientCode || filters.consultationTopic
    || filters.riskLevel || filters.crisisWarningStatus
    || filters.emotionalState || filters.intervention
    || filters.nextGoal || filters.keyword;

  const updateFilter = (field: keyof CaseSearchFilters, value: string) => {
    onFiltersChange({ ...filters, [field]: value });
    setActiveViewId(null);
  };

  const applyView = (view: SavedFilterView) => {
    onFiltersChange({
      clientCode: view.filters.clientCode || "",
      consultationTopic: view.filters.consultationTopic || "",
      riskLevel: view.filters.riskLevel || "",
      crisisWarningStatus: view.filters.crisisWarningStatus || "",
      emotionalState: view.filters.emotionalState || "",
      intervention: view.filters.intervention || "",
      nextGoal: view.filters.nextGoal || "",
      keyword: view.filters.keyword || "",
    });
    setActiveViewId(view.id);
    showToast(`已切换到视图「${view.name}」`, "success");
  };

  const handleSaveView = () => {
    if (!newViewName.trim()) {
      showToast("请输入视图名称", "error");
      return;
    }
    const newView: SavedFilterView = {
      id: `view_${Date.now()}`,
      name: newViewName.trim(),
      filters: {
        consultationTopic: filters.consultationTopic,
        riskLevel: filters.riskLevel,
        crisisWarningStatus: filters.crisisWarningStatus,
        emotionalState: filters.emotionalState,
        intervention: filters.intervention,
        nextGoal: filters.nextGoal,
        keyword: filters.keyword,
        clientCode: filters.clientCode || undefined,
      },
      createdAt: new Date().toISOString(),
    };
    const updatedViews = [...savedViews, newView];
    setSavedViews(updatedViews);
    saveSavedViews(updatedViews);
    setActiveViewId(newView.id);
    setShowSaveDialog(false);
    setNewViewName("");
    showToast(`视图「${newView.name}」已保存`, "success");
  };

  const handleDeleteView = (viewId: string, viewName: string) => {
    if (!confirm(`确定要删除视图「${viewName}」吗？`)) return;
    const updatedViews = savedViews.filter(v => v.id !== viewId);
    setSavedViews(updatedViews);
    saveSavedViews(updatedViews);
    if (activeViewId === viewId) {
      setActiveViewId(null);
    }
    showToast(`视图「${viewName}」已删除`, "info");
  };

  const handleReset = () => {
    onReset();
    setActiveViewId(null);
  };

  const crisisWarningStatuses: CrisisWarningStatus[] = ["pending", "confirmed", "escalated", "referred", "closed"];

  return (
    <div className="case-search-panel">
      {savedViews.length > 0 && (
        <div className="case-views-bar">
          <div className="case-views-label">常用视图：</div>
          <div className="case-views-tabs">
            <button
              className={`case-view-tab ${activeViewId === null ? "active" : ""}`}
              onClick={handleReset}
            >
              全部
            </button>
            {savedViews.map(view => (
              <button
                key={view.id}
                className={`case-view-tab ${activeViewId === view.id ? "active" : ""}`}
                onClick={() => applyView(view)}
              >
                {view.name}
              </button>
            ))}
          </div>
          <div className="case-views-actions">
            <button
              className="case-view-save-btn"
              onClick={() => setShowSaveDialog(true)}
              disabled={!hasActiveFilters}
              title={hasActiveFilters ? "保存当前筛选条件为视图" : "请先设置筛选条件"}
            >
              💾 保存视图
            </button>
            <button
              className="case-view-manage-btn"
              onClick={() => setShowViewManager(true)}
            >
              ⚙️ 管理
            </button>
          </div>
        </div>
      )}

      {savedViews.length === 0 && hasActiveFilters && (
        <div className="case-views-empty">
          <span>设置好筛选条件后，可以点击「保存视图」将常用条件保存下来，下次直接切换</span>
          <button
            className="case-view-save-btn"
            onClick={() => setShowSaveDialog(true)}
          >
            💾 保存视图
          </button>
        </div>
      )}

      <div className="case-search-header">
        <div className="case-search-title-row">
          <h3 className="case-search-title">个案搜索与高级筛选</h3>
          <button
            className="case-search-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "收起筛选" : "展开筛选"}
            <span className={`case-search-arrow ${isExpanded ? "expanded" : ""}`}>▼</span>
          </button>
        </div>
        <div className="case-search-quick">
          <input
            className="case-search-input"
            type="text"
            placeholder="按来访者代号搜索…"
            value={filters.clientCode}
            onChange={e => updateFilter("clientCode", e.target.value)}
          />
          <input
            className="case-search-input"
            type="text"
            placeholder="关键词搜索（主要困扰、干预方法）…"
            value={filters.keyword}
            onChange={e => updateFilter("keyword", e.target.value)}
          />
          {hasActiveFilters && (
            <div className="case-search-active-info">
              <span className="case-search-result-count">
                {resultCount} / {totalCount} 条记录
              </span>
              <button className="case-search-reset" onClick={handleReset}>清除筛选</button>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="case-search-advanced">
          <div className="case-search-grid">
            <label className="case-search-field">
              <span className="case-search-label">来访者代号</span>
              <input
                type="text"
                placeholder="输入代号关键词"
                value={filters.clientCode}
                onChange={e => updateFilter("clientCode", e.target.value)}
              />
            </label>
            <label className="case-search-field">
              <span className="case-search-label">咨询主题</span>
              <select
                value={filters.consultationTopic}
                onChange={e => updateFilter("consultationTopic", e.target.value)}
              >
                <option value="">全部主题</option>
                {allTopics.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="case-search-field">
              <span className="case-search-label">风险等级</span>
              <select
                value={filters.riskLevel}
                onChange={e => updateFilter("riskLevel", e.target.value)}
              >
                <option value="">全部等级</option>
                {(["high", "medium", "watch", "stable"] as RiskLevel[]).map(level => (
                  <option key={level} value={level}>{riskLevelLabels[level]}</option>
                ))}
              </select>
            </label>
            <label className="case-search-field">
              <span className="case-search-label">危机预警状态</span>
              <select
                value={filters.crisisWarningStatus}
                onChange={e => updateFilter("crisisWarningStatus", e.target.value)}
              >
                <option value="">全部状态</option>
                {crisisWarningStatuses.map(status => (
                  <option key={status} value={status}>{crisisWarningStatusLabels[status]}</option>
                ))}
              </select>
            </label>
            <label className="case-search-field">
              <span className="case-search-label">情绪状态</span>
              <select
                value={filters.emotionalState}
                onChange={e => updateFilter("emotionalState", e.target.value)}
              >
                <option value="">全部状态</option>
                {allEmotionalStates.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="case-search-field">
              <span className="case-search-label">干预方法</span>
              <select
                value={filters.intervention}
                onChange={e => updateFilter("intervention", e.target.value)}
              >
                <option value="">全部方法</option>
                {allInterventions.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="case-search-field">
              <span className="case-search-label">下次目标关键词</span>
              <input
                type="text"
                placeholder="输入目标关键词"
                value={filters.nextGoal}
                onChange={e => updateFilter("nextGoal", e.target.value)}
              />
            </label>
            <label className="case-search-field">
              <span className="case-search-label">全文关键词</span>
              <input
                type="text"
                placeholder="输入关键词搜索"
                value={filters.keyword}
                onChange={e => updateFilter("keyword", e.target.value)}
              />
            </label>
          </div>
          <div className="case-search-actions">
            <span className="case-search-hint">支持多条件组合查询，条件间取交集</span>
            <div className="case-search-action-buttons">
              {hasActiveFilters && (
                <button
                  className="case-view-save-btn-inline"
                  onClick={() => setShowSaveDialog(true)}
                >
                  💾 保存为视图
                </button>
              )}
              <button className="case-search-reset-btn" onClick={handleReset}>重置所有条件</button>
            </div>
          </div>
        </div>
      )}

      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">保存筛选视图</h3>
            <p className="modal-desc">将当前设置的筛选条件保存为常用视图，下次可直接切换使用</p>
            <label className="modal-field">
              <span>视图名称</span>
              <input
                type="text"
                placeholder="例如：高风险个案、危机预警中..."
                value={newViewName}
                onChange={e => setNewViewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSaveView();
                }}
                autoFocus
              />
            </label>
            <div className="modal-filter-preview">
              <p className="modal-preview-title">当前筛选条件：</p>
              <div className="modal-preview-tags">
                {filters.consultationTopic && <span className="filter-tag">主题：{filters.consultationTopic}</span>}
                {filters.riskLevel && <span className="filter-tag">风险：{riskLevelLabels[filters.riskLevel as RiskLevel]}</span>}
                {filters.crisisWarningStatus && <span className="filter-tag">预警：{crisisWarningStatusLabels[filters.crisisWarningStatus as CrisisWarningStatus]}</span>}
                {filters.emotionalState && <span className="filter-tag">情绪：{filters.emotionalState}</span>}
                {filters.intervention && <span className="filter-tag">干预：{filters.intervention}</span>}
                {filters.nextGoal && <span className="filter-tag">目标：{filters.nextGoal}</span>}
                {filters.keyword && <span className="filter-tag">关键词：{filters.keyword}</span>}
                {filters.clientCode && <span className="filter-tag">代号：{filters.clientCode}</span>}
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowSaveDialog(false)}>取消</button>
              <button className="primary-action" onClick={handleSaveView}>保存</button>
            </div>
          </div>
        </div>
      )}

      {showViewManager && (
        <div className="modal-overlay" onClick={() => setShowViewManager(false)}>
          <div className="modal-content wide" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">管理筛选视图</h3>
            {savedViews.length === 0 ? (
              <p className="modal-empty">暂无已保存的视图</p>
            ) : (
              <div className="view-manager-list">
                {savedViews.map(view => (
                  <div key={view.id} className="view-manager-item">
                    <div className="view-item-info">
                      <div className="view-item-name">{view.name}</div>
                      <div className="view-item-filters">
                        {view.filters.consultationTopic && <span className="filter-tag small">主题：{view.filters.consultationTopic}</span>}
                        {view.filters.riskLevel && <span className="filter-tag small">风险：{riskLevelLabels[view.filters.riskLevel as RiskLevel]}</span>}
                        {view.filters.crisisWarningStatus && <span className="filter-tag small">预警：{crisisWarningStatusLabels[view.filters.crisisWarningStatus as CrisisWarningStatus]}</span>}
                        {view.filters.keyword && <span className="filter-tag small">关键词：{view.filters.keyword}</span>}
                        {view.filters.clientCode && <span className="filter-tag small">代号：{view.filters.clientCode}</span>}
                      </div>
                      <div className="view-item-date">
                        创建于 {new Date(view.createdAt).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                    <div className="view-item-actions">
                      <button
                        className="link"
                        onClick={() => {
                          applyView(view);
                          setShowViewManager(false);
                        }}
                      >
                        应用
                      </button>
                      <button
                        className="link tl-btn-danger"
                        onClick={() => handleDeleteView(view.id, view.name)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button onClick={() => setShowViewManager(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{t.type === "error" ? "✕" : t.type === "success" ? "✓" : "ℹ"}</span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

type AppTab = "caseRecords" | "timeline" | "risk" | "goals" | "crisisWarning" | "supervision" | "export" | "audit";

function App() {
  const { currentRole, switchRole, session, hasPermission: hasPerm, assertPermission: assertPerm } = useAuth();
  const [activeTab, setActiveTab] = useState<AppTab>("caseRecords");
  const [timeline, setTimeline] = useState<TimelineRecord[]>(initialTimelineData);
  const [assessments, setAssessments] = useState<RiskAssessment[]>(initialRiskAssessments);
  const [goals, setGoals] = useState<InterventionGoal[]>(initialGoals);
  const [caseRecords, setCaseRecords] = useState<CaseRecord[]>(initialCaseRecords);
  const [supervisionRecords, setSupervisionRecords] = useState<SupervisionRecord[]>(initialSupervisionRecords);
  const [crisisWarnings, setCrisisWarnings] = useState<CrisisWarning[]>(initialCrisisWarnings);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dbStatus, setDbStatus] = useState<DBStatus>({ isSupported: true, isConnected: false, version: 0 });
  const [showDBUpgradeNotice, setShowDBUpgradeNotice] = useState(false);
  const [caseFormData, setCaseFormData] = useState<Record<string, string>>({});
  const [editingCaseRecord, setEditingCaseRecord] = useState<CaseRecord | null>(null);
  const [isCaseFormOpen, setIsCaseFormOpen] = useState(false);
  const [caseSearchFilters, setCaseSearchFilters] = useState<CaseSearchFilters>({
    clientCode: "",
    consultationTopic: "",
    riskLevel: "",
    crisisWarningStatus: "",
    emotionalState: "",
    intervention: "",
    nextGoal: "",
    keyword: "",
  });
  const toastIdRef = useRef(0);
  const isLoadedRef = useRef(false);
  const isDBSupported = useMemo(() => checkDBSupport(), []);

  const showToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const createAudit = useCallback((params: {
    action: Parameters<typeof createAuditLog>[0]["action"];
    targetType: Parameters<typeof createAuditLog>[0]["targetType"];
    targetId?: string;
    targetLabel?: string;
    permissionChecked?: PermissionAction;
    status?: Parameters<typeof createAuditLog>[0]["status"];
    details?: Record<string, unknown>;
    message?: string;
  }) => {
    createAuditLog({
      actorRole: currentRole,
      actorName: session?.userName,
      ...params,
    });
  }, [currentRole, session?.userName]);

  const handleDBEvent = useCallback((event: DBEventType, data?: unknown) => {
    if (event === "upgrade") {
      const upgradeData = data as { from?: number; to?: number; reason?: string };
      if (upgradeData.reason === "versionchange") {
        showToast("数据库版本已更新，请刷新页面以获取最新功能", "info");
      } else if (upgradeData.from !== undefined && upgradeData.to !== undefined) {
        setShowDBUpgradeNotice(true);
        showToast(`数据库已从 v${upgradeData.from} 升级到 v${upgradeData.to}`, "success");
      }
    } else if (event === "blocked") {
      showToast("数据库升级被阻塞，请关闭其他标签页后刷新", "error");
    } else if (event === "error") {
      const error = data as Error;
      console.error("[DB] 数据库错误:", error);
      showToast(error?.message || "数据库操作出错", "error");
    } else if (event === "success") {
      const successData = data as { version?: number };
      if (successData?.version) {
        setDbStatus(prev => ({ ...prev, version: successData.version!, isConnected: true }));
      }
    }
  }, [showToast]);

  useEffect(() => {
    const removeListener = addDBListener(handleDBEvent);

    (async () => {
      const status = await getDBStatus();
      setDbStatus(status);
      if (!status.isSupported) {
        showToast("当前浏览器不支持离线存储功能，请使用现代浏览器", "error");
      }
    })();

    return () => { removeListener(); };
  }, [handleDBEvent, showToast]);

  useEffect(() => {
    if (isLoadedRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await loadAllData(
          initialTimelineData,
          initialRiskAssessments,
          initialGoals,
          initialCaseRecords,
          initialCrisisWarnings,
          nextTimelineId,
          nextRiskId,
          nextGoalId,
          nextCaseRecordId,
          nextCrisisWarningId
        );
        if (cancelled) return;
        setTimeline(data.timeline);
        setAssessments(data.riskAssessments);
        setGoals(data.goals);
        setCaseRecords(data.caseRecords);
        setCrisisWarnings(data.crisisWarnings);
        nextTimelineId = data.nextTimelineId;
        nextRiskId = data.nextRiskId;
        nextGoalId = data.nextGoalId;
        nextCaseRecordId = data.nextCaseRecordId;
        nextCrisisWarningId = data.nextCrisisWarningId;
        isLoadedRef.current = true;
        setIsLoading(false);
        showToast("个案档案数据加载完成", "success");
      } catch (err) {
        if (cancelled) return;
        console.error("[DB] 加载数据失败:", err);
        const errorMsg = err instanceof Error ? err.message : "未知错误";
        showToast(`数据加载失败：${errorMsg}，已使用本地示例数据`, "error");
        isLoadedRef.current = true;
        setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showToast]);

  const persistTimeline = useCallback(async (records: TimelineRecord[]) => {
    try {
      for (const r of records) {
        await saveTimelineRecord(r);
      }
    } catch (err) {
      console.error("[DB] 保存时间线失败:", err);
      showToast("时间线数据保存失败，请检查浏览器存储");
    }
  }, [showToast]);

  const persistTimelineDelete = useCallback(async (id: string) => {
    try {
      await dbDeleteTimeline(id);
    } catch (err) {
      console.error("[DB] 删除时间线记录失败:", err);
      showToast("删除时间线记录失败");
    }
  }, [showToast]);

  const persistAssessment = useCallback(async (a: RiskAssessment) => {
    try {
      await saveRiskAssessment(a);
    } catch (err) {
      console.error("[DB] 保存风险评估失败:", err);
      showToast("风险评估数据保存失败");
    }
  }, [showToast]);

  const persistAssessmentDelete = useCallback(async (id: string) => {
    try {
      await dbDeleteRisk(id);
    } catch (err) {
      console.error("[DB] 删除风险评估失败:", err);
      showToast("删除风险评估记录失败");
    }
  }, [showToast]);

  const persistGoal = useCallback(async (g: InterventionGoal) => {
    try {
      await saveGoal(g);
    } catch (err) {
      console.error("[DB] 保存目标失败:", err);
      showToast("目标数据保存失败");
    }
  }, [showToast]);

  const persistGoalDelete = useCallback(async (id: string) => {
    try {
      await dbDeleteGoal(id);
    } catch (err) {
      console.error("[DB] 删除目标失败:", err);
      showToast("删除目标记录失败");
    }
  }, [showToast]);

  const persistCaseRecord = useCallback(async (record: CaseRecord) => {
    try {
      await saveCaseRecord(record);
    } catch (err) {
      console.error("[DB] 保存个案记录失败:", err);
      showToast("个案记录保存失败");
    }
  }, [showToast]);

  const persistCaseRecordDelete = useCallback(async (id: string) => {
    try {
      await dbDeleteCaseRecord(id);
    } catch (err) {
      console.error("[DB] 删除个案记录失败:", err);
      showToast("删除个案记录失败");
    }
  }, [showToast]);

  const persistCounters = useCallback(async () => {
    try {
      await saveCounters(nextTimelineId, nextRiskId, nextGoalId, nextCaseRecordId, nextCrisisWarningId);
    } catch (err) {
      console.error("[DB] 保存计数器失败:", err);
    }
  }, [showToast]);

  const persistCrisisWarning = useCallback(async (w: CrisisWarning) => {
    try {
      await saveCrisisWarning(w);
    } catch (err) {
      console.error("[DB] 保存危机预警失败:", err);
      showToast("危机预警数据保存失败");
    }
  }, [showToast]);

  const persistCrisisWarningDelete = useCallback(async (id: string) => {
    try {
      await dbDeleteCrisisWarning(id);
    } catch (err) {
      console.error("[DB] 删除危机预警失败:", err);
      showToast("删除危机预警记录失败");
    }
  }, [showToast]);

  const handleResetToSampleData = useCallback(async () => {
    try {
      assertPerm("system.reset", "重置示例数据");
    } catch (e) {
      showToast("无权限执行此操作", "error");
      return;
    }
    if (!confirm("确定要重置所有数据吗？此操作将清空所有修改并恢复为示例数据。")) {
      return;
    }
    createAudit({
      action: "system_reset",
      targetType: "system",
      permissionChecked: "system.reset",
      message: "用户请求重置系统数据为示例数据",
    });
    try {
      setIsLoading(true);
      const data = await resetToSampleData(
        initialTimelineData,
        initialRiskAssessments,
        initialGoals,
        initialCaseRecords,
        initialCrisisWarnings,
        7,
        4,
        7,
        4,
        3
      );
      setTimeline(data.timeline);
      setAssessments(data.riskAssessments);
      setGoals(data.goals);
      setCaseRecords(data.caseRecords);
      setCrisisWarnings(data.crisisWarnings);
      nextTimelineId = data.nextTimelineId;
      nextRiskId = data.nextRiskId;
      nextGoalId = data.nextGoalId;
      nextCaseRecordId = data.nextCaseRecordId;
      nextCrisisWarningId = data.nextCrisisWarningId;
      createAudit({
        action: "system_reset",
        targetType: "system",
        permissionChecked: "system.reset",
        status: "success",
        message: "系统数据已重置为示例数据",
      });
      showToast("数据已重置为示例数据", "success");
    } catch (err) {
      console.error("[DB] 重置数据失败:", err);
      createAudit({
        action: "system_reset",
        targetType: "system",
        permissionChecked: "system.reset",
        status: "failed",
        message: "系统数据重置失败",
      });
      showToast("重置数据失败");
    } finally {
      setIsLoading(false);
    }
  }, [assertPerm, createAudit, showToast]);

  const handleCaseFieldChange = useCallback((field: string, value: string) => {
    setCaseFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const openNewCaseForm = useCallback(() => {
    try {
      assertPerm("case.create", "新增个案记录");
    } catch (e) {
      showToast("无权限新增个案记录", "error");
      return;
    }
    setEditingCaseRecord({
      id: "",
      clientCode: "",
      consultationTopic: "",
      sessionDate: new Date().toISOString().slice(0, 10),
      mainConcern: "",
      emotionalState: emotionalOptions[0],
      intervention: "",
      nextGoal: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setIsCaseFormOpen(true);
  }, [assertPerm, showToast]);

  const openEditCaseForm = useCallback((record: CaseRecord) => {
    try {
      assertPerm("case.edit", "编辑个案记录");
    } catch (e) {
      showToast("无权限编辑个案记录", "error");
      return;
    }
    setEditingCaseRecord({ ...record });
    setIsCaseFormOpen(true);
  }, [assertPerm, showToast]);

  const handleSaveCaseRecord = useCallback(() => {
    if (!editingCaseRecord) return;
    const isEdit = !!editingCaseRecord.id;
    const permAction = isEdit ? "case.edit" : "case.create";
    try {
      assertPerm(permAction, isEdit ? "编辑个案记录" : "新增个案记录");
    } catch (e) {
      showToast("无权限执行此操作", "error");
      return;
    }
    if (!editingCaseRecord.clientCode || !editingCaseRecord.consultationTopic
      || !editingCaseRecord.mainConcern || !editingCaseRecord.intervention) {
      showToast("请填写必填项（来访者代号、咨询主题、主要困扰、干预方法）");
      return;
    }
    const now = new Date().toISOString();
    const finalRecord: CaseRecord = {
      ...editingCaseRecord,
      updatedAt: now,
    };
    if (finalRecord.id) {
      setCaseRecords(prev => prev.map(r => r.id === finalRecord.id ? finalRecord : r));
      persistCaseRecord(finalRecord);
      createAudit({
        action: "update",
        targetType: "case_record",
        targetId: finalRecord.id,
        targetLabel: finalRecord.clientCode,
        permissionChecked: "case.edit",
        status: "success",
        message: "个案记录已更新",
      });
    } else {
      const newRecord = { ...finalRecord, id: "cr" + nextCaseRecordId++, createdAt: now };
      setCaseRecords(prev => [...prev, newRecord]);
      persistCaseRecord(newRecord);
      persistCounters();
      createAudit({
        action: "create",
        targetType: "case_record",
        targetId: newRecord.id,
        targetLabel: newRecord.clientCode,
        permissionChecked: "case.create",
        status: "success",
        message: "个案记录已创建",
      });
    }
    const savedRecord = finalRecord.id ? finalRecord : { ...finalRecord, id: "cr" + (nextCaseRecordId - 1), createdAt: now };
    const latestRisk = assessments
      .filter(a => a.clientCode === savedRecord.clientCode)
      .sort((a, b) => b.assessDate.localeCompare(a.assessDate))[0];
    const currentRiskLevel = latestRisk?.level || "stable";
    const { trigger, reasons } = shouldTriggerCrisisWarning(
      currentRiskLevel,
      [savedRecord.mainConcern, savedRecord.intervention, savedRecord.nextGoal]
    );
    if (trigger && !isDuplicateWarning(crisisWarnings, savedRecord.clientCode, Date.now())) {
      const warningNow = new Date().toISOString();
      const warning: CrisisWarning = {
        id: "cw" + nextCrisisWarningId++,
        clientCode: savedRecord.clientCode,
        triggerType: "case_record",
        triggerId: savedRecord.id,
        triggerReason: reasons.join("；"),
        status: "pending",
        createdAt: warningNow,
        updatedAt: warningNow,
        actions: [],
      };
      setCrisisWarnings(prev => [...prev, warning]);
      persistCrisisWarning(warning);
      persistCounters();
      showToast(`已自动创建危机预警：${savedRecord.clientCode}`, "info");
    }
    setIsCaseFormOpen(false);
    setEditingCaseRecord(null);
    showToast("个案记录已保存", "success");
  }, [editingCaseRecord, persistCaseRecord, persistCounters, showToast, assertPerm, createAudit, persistCrisisWarning, assessments, crisisWarnings]);

  const handleDeleteCaseRecord = useCallback((id: string) => {
    try {
      assertPerm("case.delete", "删除个案记录");
    } catch (e) {
      showToast("无权限删除个案记录", "error");
      return;
    }
    const record = caseRecords.find(r => r.id === id);
    setCaseRecords(prev => prev.filter(r => r.id !== id));
    persistCaseRecordDelete(id);
    createAudit({
      action: "delete",
      targetType: "case_record",
      targetId: id,
      targetLabel: record?.clientCode,
      permissionChecked: "case.delete",
      status: "success",
      message: "个案记录已删除",
    });
    showToast("个案记录已删除", "info");
  }, [persistCaseRecordDelete, showToast, assertPerm, createAudit, caseRecords]);

  const handleCancelCaseForm = useCallback(() => {
    setIsCaseFormOpen(false);
    setEditingCaseRecord(null);
  }, []);

  const handleAddTimeline = useCallback((record: TimelineRecord) => {
    try {
      assertPerm("timeline.create", "新增时间线记录");
    } catch (e) {
      showToast("无权限新增时间线记录", "error");
      return;
    }
    setTimeline(prev => {
      const next = [...prev, record];
      persistTimeline(next);
      persistCounters();
      return next;
    });
    createAudit({
      action: "create",
      targetType: "timeline_record",
      targetId: record.id,
      targetLabel: record.clientCode,
      permissionChecked: "timeline.create",
      status: "success",
      details: { eventType: record.eventType },
      message: "时间线记录已创建",
    });
  }, [persistTimeline, persistCounters, assertPerm, showToast, createAudit]);

  const handleUpdateTimeline = useCallback((record: TimelineRecord) => {
    try {
      assertPerm("timeline.edit", "编辑时间线记录");
    } catch (e) {
      showToast("无权限编辑时间线记录", "error");
      return;
    }
    setTimeline(prev => {
      const next = prev.map(r => r.id === record.id ? record : r);
      persistTimeline(next);
      return next;
    });
    createAudit({
      action: "update",
      targetType: "timeline_record",
      targetId: record.id,
      targetLabel: record.clientCode,
      permissionChecked: "timeline.edit",
      status: "success",
      message: "时间线记录已更新",
    });
  }, [persistTimeline, assertPerm, showToast, createAudit]);

  const handleDeleteTimeline = useCallback((id: string) => {
    try {
      assertPerm("timeline.delete", "删除时间线记录");
    } catch (e) {
      showToast("无权限删除时间线记录", "error");
      return;
    }
    const record = timeline.find(r => r.id === id);
    setTimeline(prev => prev.filter(r => r.id !== id));
    persistTimelineDelete(id);
    createAudit({
      action: "delete",
      targetType: "timeline_record",
      targetId: id,
      targetLabel: record?.clientCode,
      permissionChecked: "timeline.delete",
      status: "success",
      message: "时间线记录已删除",
    });
  }, [persistTimelineDelete, assertPerm, showToast, createAudit, timeline]);

  const handleAddAssessment = useCallback((a: RiskAssessment) => {
    try {
      assertPerm("risk.create", "新增风险评估");
    } catch (e) {
      showToast("无权限新增风险评估", "error");
      return;
    }
    setAssessments(prev => [...prev, a]);
    persistAssessment(a);
    persistCounters();
    createAudit({
      action: "create",
      targetType: "risk_assessment",
      targetId: a.id,
      targetLabel: a.clientCode,
      permissionChecked: "risk.create",
      status: "success",
      details: { level: a.level },
      message: "风险评估已创建",
    });
    const { trigger, reasons } = shouldTriggerCrisisWarning(a.level, [a.summary]);
    if (trigger && !isDuplicateWarning(crisisWarnings, a.clientCode, Date.now())) {
      const now = new Date().toISOString();
      const warning: CrisisWarning = {
        id: "cw" + nextCrisisWarningId++,
        clientCode: a.clientCode,
        triggerType: "risk_assessment",
        triggerId: a.id,
        triggerReason: reasons.join("；"),
        status: "pending",
        createdAt: now,
        updatedAt: now,
        actions: [],
      };
      setCrisisWarnings(prev => [...prev, warning]);
      persistCrisisWarning(warning);
      persistCounters();
      showToast(`已自动创建危机预警：${a.clientCode}`, "info");
    }
  }, [persistAssessment, persistCounters, assertPerm, showToast, createAudit, persistCrisisWarning, crisisWarnings]);

  const handleDeleteAssessment = useCallback((id: string) => {
    try {
      assertPerm("risk.delete", "删除风险评估");
    } catch (e) {
      showToast("无权限删除风险评估", "error");
      return;
    }
    const a = assessments.find(x => x.id === id);
    setAssessments(prev => prev.filter(a => a.id !== id));
    persistAssessmentDelete(id);
    createAudit({
      action: "delete",
      targetType: "risk_assessment",
      targetId: id,
      targetLabel: a?.clientCode,
      permissionChecked: "risk.delete",
      status: "success",
      message: "风险评估已删除",
    });
  }, [persistAssessmentDelete, assessments, assertPerm, showToast, createAudit]);

  const handleAddGoal = useCallback((g: InterventionGoal) => {
    try {
      assertPerm("goal.create", "新增目标追踪");
    } catch (e) {
      showToast("无权限新增目标追踪", "error");
      return;
    }
    setGoals(prev => [...prev, g]);
    persistGoal(g);
    persistCounters();
    createAudit({
      action: "create",
      targetType: "intervention_goal",
      targetId: g.id,
      targetLabel: g.clientCode,
      permissionChecked: "goal.create",
      status: "success",
      message: "目标追踪已创建",
    });
  }, [persistGoal, persistCounters, assertPerm, showToast, createAudit]);

  const handleUpdateGoal = useCallback((g: InterventionGoal) => {
    try {
      assertPerm("goal.edit", "编辑目标追踪");
    } catch (e) {
      showToast("无权限编辑目标追踪", "error");
      return;
    }
    setGoals(prev => prev.map(item => item.id === g.id ? g : item));
    persistGoal(g);
    createAudit({
      action: "update",
      targetType: "intervention_goal",
      targetId: g.id,
      targetLabel: g.clientCode,
      permissionChecked: "goal.edit",
      status: "success",
      message: "目标追踪已更新",
    });
  }, [persistGoal, assertPerm, showToast, createAudit]);

  const handleDeleteGoal = useCallback((id: string) => {
    try {
      assertPerm("goal.delete", "删除目标追踪");
    } catch (e) {
      showToast("无权限删除目标追踪", "error");
      return;
    }
    const g = goals.find(x => x.id === id);
    setGoals(prev => prev.filter(g => g.id !== id));
    persistGoalDelete(id);
    createAudit({
      action: "delete",
      targetType: "intervention_goal",
      targetId: id,
      targetLabel: g?.clientCode,
      permissionChecked: "goal.delete",
      status: "success",
      message: "目标追踪已删除",
    });
  }, [persistGoalDelete, goals, assertPerm, showToast, createAudit]);

  const handleAddSupervisionRecord = useCallback((record: SupervisionRecord) => {
    try {
      assertPerm("supervision.create", "新增督导申请");
    } catch (e) {
      showToast("无权限新增督导申请", "error");
      return;
    }
    setSupervisionRecords(prev => [...prev, record]);
    createAudit({
      action: "create",
      targetType: "supervision_record",
      targetId: record.id,
      targetLabel: record.clientCode,
      permissionChecked: "supervision.create",
      status: "success",
      message: "督导申请已创建",
    });
    showToast("督导申请已保存", "success");
  }, [showToast, assertPerm, createAudit]);

  const handleUpdateSupervisionRecord = useCallback((record: SupervisionRecord) => {
    try {
      assertPerm("supervision.create", "编辑督导申请");
    } catch (e) {
      showToast("无权限编辑督导申请", "error");
      return;
    }
    setSupervisionRecords(prev => prev.map(r => r.id === record.id ? record : r));
    createAudit({
      action: "update",
      targetType: "supervision_record",
      targetId: record.id,
      targetLabel: record.clientCode,
      permissionChecked: "supervision.create",
      status: "success",
      message: "督导申请已更新",
    });
    showToast("督导申请已更新", "success");
  }, [showToast, assertPerm, createAudit]);

  const handleSubmitForSupervision = useCallback((record: SupervisionRecord) => {
    try {
      assertPerm("supervision.submit", "提交督导评审");
    } catch (e) {
      showToast("无权限提交督导评审", "error");
      return;
    }
    setSupervisionRecords(prev => prev.map(r => r.id === record.id ? record : r));
    createAudit({
      action: "submit",
      targetType: "supervision_record",
      targetId: record.id,
      targetLabel: record.clientCode,
      permissionChecked: "supervision.submit",
      status: "success",
      message: "督导申请已提交评审",
    });
    showToast("已提交督导评审", "success");
  }, [showToast, assertPerm, createAudit]);

  const handleSaveDraft = useCallback((record: SupervisionRecord) => {
    try {
      assertPerm("supervision.create", "保存督导草稿");
    } catch (e) {
      showToast("无权限保存督导草稿", "error");
      return;
    }
    setSupervisionRecords(prev => prev.map(r => r.id === record.id ? record : r));
    createAudit({
      action: "update",
      targetType: "supervision_record",
      targetId: record.id,
      targetLabel: record.clientCode,
      permissionChecked: "supervision.create",
      status: "success",
      details: { draft: true },
      message: "督导草稿已保存",
    });
    showToast("草稿已保存", "success");
  }, [showToast, assertPerm, createAudit]);

  const handleAddFeedback = useCallback((recordId: string, feedback: SupervisionFeedback) => {
    try {
      assertPerm("supervision.feedback", "提交督导反馈");
    } catch (e) {
      showToast("无权限提交督导反馈", "error");
      return;
    }
    const record = supervisionRecords.find(r => r.id === recordId);
    setSupervisionRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      return {
        ...r,
        status: "feedback",
        feedbackHistory: [...r.feedbackHistory, feedback],
        lastFeedbackAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }));
    createAudit({
      action: "feedback",
      targetType: "supervision_feedback",
      targetId: recordId,
      targetLabel: record?.clientCode,
      permissionChecked: "supervision.feedback",
      status: "success",
      details: { feedbackType: feedback.type },
      message: "督导意见已提交",
    });
    showToast("督导意见已提交", "success");
  }, [showToast, supervisionRecords, assertPerm, createAudit]);

  const handleAddCrisisWarning = useCallback((w: CrisisWarning) => {
    setCrisisWarnings(prev => [...prev, w]);
    persistCrisisWarning(w);
    persistCounters();
    createAudit({
      action: "create",
      targetType: "crisis_warning",
      targetId: w.id,
      targetLabel: w.clientCode,
      status: "success",
      message: "危机预警已自动创建",
    });
  }, [persistCrisisWarning, persistCounters, createAudit]);

  const handleUpdateCrisisWarning = useCallback((w: CrisisWarning) => {
    setCrisisWarnings(prev => prev.map(item => item.id === w.id ? w : item));
    persistCrisisWarning(w);
    createAudit({
      action: "update",
      targetType: "crisis_warning",
      targetId: w.id,
      targetLabel: w.clientCode,
      status: "success",
      details: { status: w.status },
      message: `危机预警状态更新为${crisisWarningStatusLabels[w.status]}`,
    });
    showToast(`预警状态已更新为${crisisWarningStatusLabels[w.status]}`, "success");
  }, [persistCrisisWarning, createAudit, showToast]);

  const handleDeleteCrisisWarning = useCallback((id: string) => {
    const w = crisisWarnings.find(x => x.id === id);
    setCrisisWarnings(prev => prev.filter(x => x.id !== id));
    persistCrisisWarningDelete(id);
    createAudit({
      action: "delete",
      targetType: "crisis_warning",
      targetId: id,
      targetLabel: w?.clientCode,
      status: "success",
      message: "危机预警已删除",
    });
  }, [persistCrisisWarningDelete, crisisWarnings, createAudit]);

  const handleRoleChange = useCallback((role: UserRole) => {
    switchRole(role);
  }, [switchRole]);

  const { highRiskCount, mediumRiskCount, watchRiskCount, stableRiskCount, activeClientCodes } = useMemo(() => {
    const latestByClient = new Map<string, RiskAssessment>();
    for (const a of assessments) {
      const existing = latestByClient.get(a.clientCode);
      if (!existing || existing.assessDate < a.assessDate) {
        latestByClient.set(a.clientCode, a);
      }
    }
    let high = 0;
    let medium = 0;
    let watch = 0;
    let stable = 0;
    for (const a of latestByClient.values()) {
      if (a.level === "high") high++;
      else if (a.level === "medium") medium++;
      else if (a.level === "watch") watch++;
      else if (a.level === "stable") stable++;
    }
    const codesFromTimeline = Array.from(new Set(timeline.map(r => r.clientCode)));
    const codesFromAssess = Array.from(latestByClient.keys());
    const codesFromGoals = Array.from(new Set(goals.map(g => g.clientCode)));
    const codesFromCaseRecords = Array.from(new Set(caseRecords.map(r => r.clientCode)));
    const allCodes = Array.from(new Set([
      ...codesFromTimeline,
      ...codesFromAssess,
      ...codesFromGoals,
      ...codesFromCaseRecords
    ])).sort();
    return {
      highRiskCount: high,
      mediumRiskCount: medium,
      watchRiskCount: watch,
      stableRiskCount: stable,
      activeClientCodes: allCodes
    };
  }, [assessments, goals, timeline, caseRecords]);

  const thisWeekSessionCount = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);

    let count = 0;
    timeline.forEach(r => {
      if (r.sessionDate) {
        const sessionDate = new Date(r.sessionDate);
        if (sessionDate >= weekStart && sessionDate <= now) {
          count++;
        }
      }
    });
    caseRecords.forEach(r => {
      if (r.sessionDate) {
        const sessionDate = new Date(r.sessionDate);
        if (sessionDate >= weekStart && sessionDate <= now) {
          count++;
        }
      }
    });
    return count;
  }, [timeline, caseRecords]);

  const goalProgressCount = useMemo(() => {
    const activeGoals = goals.filter(g => g.status === "active");
    if (activeGoals.length === 0) return "0";
    const total = activeGoals.reduce((s, g) => s + g.totalSteps, 0);
    const completed = activeGoals.reduce((s, g) => s + g.completedSteps, 0);
    return total > 0 ? String(Math.round((completed / total) * 100)) + "%" : "0%";
  }, [goals]);

  const metricValues = useMemo(() => {
    return [
      String(activeClientCodes.length),
      String(highRiskCount + mediumRiskCount),
      String(thisWeekSessionCount),
      goalProgressCount
    ];
  }, [activeClientCodes.length, highRiskCount, mediumRiskCount, thisWeekSessionCount, goalProgressCount]);

  const crisisWarningStats = useMemo(() => {
    const pending = crisisWarnings.filter(w => w.status === "pending").length;
    const openWarnings = crisisWarnings.filter(w => w.status !== "closed").length;
    const byClient = new Map<string, CrisisWarningStatus>();
    crisisWarnings.filter(w => w.status !== "closed").forEach(w => {
      const existing = byClient.get(w.clientCode);
      if (!existing) {
        byClient.set(w.clientCode, w.status);
      }
    });
    return { pending, openWarnings, byClient };
  }, [crisisWarnings]);

  const latestRiskByClient = useMemo(() => {
    const map = new Map<string, RiskAssessment>();
    for (const a of assessments) {
      const existing = map.get(a.clientCode);
      if (!existing || existing.assessDate < a.assessDate) {
        map.set(a.clientCode, a);
      }
    }
    return map;
  }, [assessments]);

  const caseSearchOptions = useMemo(() => {
    const topics = Array.from(new Set(caseRecords.map(r => r.consultationTopic).filter(Boolean))).sort();
    const emotionalStates = Array.from(new Set(caseRecords.map(r => r.emotionalState).filter(Boolean))).sort();
    const interventions = Array.from(new Set(caseRecords.map(r => r.intervention).filter(Boolean))).sort();
    return { topics, emotionalStates, interventions };
  }, [caseRecords]);

  const hasCaseSearchFilters = caseSearchFilters.clientCode || caseSearchFilters.consultationTopic
    || caseSearchFilters.riskLevel || caseSearchFilters.crisisWarningStatus
    || caseSearchFilters.emotionalState || caseSearchFilters.intervention
    || caseSearchFilters.nextGoal || caseSearchFilters.keyword;

  const filteredCaseRecords = useMemo(() => {
    if (!hasCaseSearchFilters) return caseRecords;
    return caseRecords.filter(record => {
      if (caseSearchFilters.clientCode) {
        if (!record.clientCode.toLowerCase().includes(caseSearchFilters.clientCode.toLowerCase())) return false;
      }
      if (caseSearchFilters.consultationTopic) {
        if (record.consultationTopic !== caseSearchFilters.consultationTopic) return false;
      }
      if (caseSearchFilters.riskLevel) {
        const latestRisk = latestRiskByClient.get(record.clientCode);
        if (!latestRisk || latestRisk.level !== caseSearchFilters.riskLevel) return false;
      }
      if (caseSearchFilters.crisisWarningStatus) {
        const hasMatchingWarning = crisisWarnings.some(w =>
          w.clientCode === record.clientCode && w.status === caseSearchFilters.crisisWarningStatus
        );
        if (!hasMatchingWarning) return false;
      }
      if (caseSearchFilters.emotionalState) {
        if (record.emotionalState !== caseSearchFilters.emotionalState) return false;
      }
      if (caseSearchFilters.intervention) {
        if (!record.intervention.toLowerCase().includes(caseSearchFilters.intervention.toLowerCase())) return false;
      }
      if (caseSearchFilters.nextGoal) {
        if (!record.nextGoal.toLowerCase().includes(caseSearchFilters.nextGoal.toLowerCase())) return false;
      }
      if (caseSearchFilters.keyword) {
        const keyword = caseSearchFilters.keyword.toLowerCase();
        const matchesKeyword = 
          record.mainConcern.toLowerCase().includes(keyword) ||
          record.intervention.toLowerCase().includes(keyword) ||
          record.nextGoal.toLowerCase().includes(keyword) ||
          record.emotionalState.toLowerCase().includes(keyword) ||
          record.consultationTopic.toLowerCase().includes(keyword);
        if (!matchesKeyword) return false;
      }
      return true;
    });
  }, [caseRecords, caseSearchFilters, hasCaseSearchFilters, latestRiskByClient, crisisWarningStats, crisisWarnings]);

  const resetCaseSearchFilters = useCallback(() => {
    setCaseSearchFilters({
      clientCode: "",
      consultationTopic: "",
      riskLevel: "",
      crisisWarningStatus: "",
      emotionalState: "",
      intervention: "",
      nextGoal: "",
      keyword: "",
    });
  }, []);

  if (isLoading) {
    return (
      <main className="app-shell">
        <div className="db-loading">
          <div className="db-loading-spinner" />
          <p>正在加载个案档案数据…</p>
          <p className="db-loading-subtext">数据将自动保存到本地浏览器，刷新后不会丢失</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ToastContainer toasts={toasts} />

      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard
            key={metric}
            label={metric}
            value={metricValues[index]}
            index={index}
            highlight={metric === "高风险关注" && highRiskCount + mediumRiskCount > 0}
          />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <UserInfoBar />
          <h2>角色切换</h2>
          <RoleSwitcher variant="vertical" />
          <ProtectedMenu menu="menu.auditLog">
            <h2 style={{ marginTop: 16 }}>系统功能</h2>
            <button
              className={`role-chip ${activeTab === "audit" ? "active" : ""}`}
              style={{ marginTop: 8 }}
              onClick={() => setActiveTab("audit")}
            >
              📋 审计日志
            </button>
          </ProtectedMenu>
          <ProtectedMenu menu="menu.dataOverview">
            <>
              <h2>筛选</h2>
              <div className="chips muted">
                {project.filters.map((filter: string) => (
                  <button key={filter}>{filter}</button>
                ))}
              </div>
            </>
          </ProtectedMenu>
          <h2>风险分布</h2>
          <div className="risk-distribution">
            <div className="risk-dist-item">
              <span className={`risk-dot ${riskLevelColors.high}`} />
              <span className="risk-dist-label">高风险</span>
              <strong className="risk-dist-count">{highRiskCount}</strong>
            </div>
            <div className="risk-dist-item">
              <span className={`risk-dot ${riskLevelColors.medium}`} />
              <span className="risk-dist-label">中风险</span>
              <strong className="risk-dist-count">{mediumRiskCount}</strong>
            </div>
            <div className="risk-dist-item">
              <span className={`risk-dot ${riskLevelColors.watch}`} />
              <span className="risk-dist-label">关注</span>
              <strong className="risk-dist-count">{watchRiskCount}</strong>
            </div>
            <div className="risk-dist-item">
              <span className={`risk-dot ${riskLevelColors.stable}`} />
              <span className="risk-dist-label">稳定</span>
              <strong className="risk-dist-count">{stableRiskCount}</strong>
            </div>
          </div>
          <h2>危机预警</h2>
          <div className="cw-sidebar-summary">
            <div className={`cw-sidebar-alert ${crisisWarningStats.pending > 0 ? "cw-alert-active" : ""}`}>
              <span className="cw-sidebar-alert-icon">🚨</span>
              <strong className="cw-sidebar-alert-count">{crisisWarningStats.pending}</strong>
              <span className="cw-sidebar-alert-label">待处理</span>
            </div>
            <div className="cw-sidebar-stats">
              <div className="cw-sidebar-stat">
                <span className="cw-sidebar-stat-label">活跃预警</span>
                <strong className="cw-sidebar-stat-value">{crisisWarningStats.openWarnings}</strong>
              </div>
              <div className="cw-sidebar-stat">
                <span className="cw-sidebar-stat-label">涉及个案</span>
                <strong className="cw-sidebar-stat-value">{crisisWarningStats.byClient.size}</strong>
              </div>
            </div>
          </div>
          <h2>离线存储</h2>
          <div className="db-status-section">
            <span className={`db-status-dot ${dbStatus.isConnected ? 'db-status-online' : 'db-status-offline'}`} />
            <span className="db-status-text">
              {dbStatus.isConnected
                ? `IndexedDB v${dbStatus.version} 已连接`
                : dbStatus.error
                  ? dbStatus.error
                  : '正在连接...'}
            </span>
          </div>
          <div className="db-stats">
            <div className="db-stat-item">
              <span className="db-stat-label">个案记录</span>
              <strong className="db-stat-value">{caseRecords.length}</strong>
            </div>
            <div className="db-stat-item">
              <span className="db-stat-label">时间线</span>
              <strong className="db-stat-value">{timeline.length}</strong>
            </div>
            <div className="db-stat-item">
              <span className="db-stat-label">风险评估</span>
              <strong className="db-stat-value">{assessments.length}</strong>
            </div>
            <div className="db-stat-item">
              <span className="db-stat-label">干预目标</span>
              <strong className="db-stat-value">{goals.length}</strong>
            </div>
            <div className="db-stat-item">
              <span className="db-stat-label">危机预警</span>
              <strong className="db-stat-value">{crisisWarnings.length}</strong>
            </div>
          </div>
          {showDBUpgradeNotice && (
            <div className="db-upgrade-notice">
              <p>✓ 数据库已升级</p>
              <button onClick={() => setShowDBUpgradeNotice(false)}>知道了</button>
            </div>
          )}
          {!isDBSupported && (
            <div className="db-error-notice">
              <p>⚠ 浏览器不支持离线存储</p>
              <small>请使用 Chrome、Firefox、Safari 等现代浏览器</small>
            </div>
          )}
        </aside>

        <div className="panel" style={{ flex: 1 }}>
          {activeTab === "audit" ? (
            <AuditLogViewer />
          ) : (
            <>
              <div style={{
                display: "flex",
                gap: 4,
                borderBottom: "1px solid var(--border-subtle)",
                marginBottom: 20,
                flexWrap: "wrap",
              }}>
                <ProtectedMenu menu="menu.caseRecords">
                  <button
                    className={`role-chip ${activeTab === "caseRecords" ? "active" : ""}`}
                    onClick={() => setActiveTab("caseRecords")}
                    style={{ marginBottom: -1, borderRadius: "8px 8px 0 0" }}
                  >
                    📁 个案档案
                  </button>
                </ProtectedMenu>
                <ProtectedMenu menu="menu.riskAssessment">
                  <button
                    className={`role-chip ${activeTab === "risk" ? "active" : ""}`}
                    onClick={() => setActiveTab("risk")}
                    style={{ marginBottom: -1, borderRadius: "8px 8px 0 0" }}
                  >
                    ⚠️ 风险评估
                  </button>
                </ProtectedMenu>
                <ProtectedMenu menu="menu.goalTracking">
                  <button
                    className={`role-chip ${activeTab === "goals" ? "active" : ""}`}
                    onClick={() => setActiveTab("goals")}
                    style={{ marginBottom: -1, borderRadius: "8px 8px 0 0" }}
                  >
                    🎯 目标追踪
                  </button>
                </ProtectedMenu>
                <ProtectedMenu menu="menu.timeline">
                  <button
                    className={`role-chip ${activeTab === "timeline" ? "active" : ""}`}
                    onClick={() => setActiveTab("timeline")}
                    style={{ marginBottom: -1, borderRadius: "8px 8px 0 0" }}
                  >
                    ⏱️ 时间线
                  </button>
                </ProtectedMenu>
                <ProtectedMenu menu="menu.supervision">
                  <button
                    className={`role-chip ${activeTab === "supervision" ? "active" : ""}`}
                    onClick={() => setActiveTab("supervision")}
                    style={{ marginBottom: -1, borderRadius: "8px 8px 0 0" }}
                  >
                    🏢 督导工作台
                  </button>
                </ProtectedMenu>
                <button
                  className={`role-chip ${activeTab === "crisisWarning" ? "active" : ""}`}
                  onClick={() => setActiveTab("crisisWarning")}
                  style={{ marginBottom: -1, borderRadius: "8px 8px 0 0" }}
                >
                  🚨 危机预警
                  {crisisWarningStats.pending > 0 && (
                    <span className="cw-tab-badge">{crisisWarningStats.pending}</span>
                  )}
                </button>
                <ProtectedMenu menu="menu.export">
                  <button
                    className={`role-chip ${activeTab === "export" ? "active" : ""}`}
                    onClick={() => setActiveTab("export")}
                    style={{ marginBottom: -1, borderRadius: "8px 8px 0 0" }}
                  >
                    📤 报告导出
                  </button>
                </ProtectedMenu>
                <PermissionGate action="system.reset">
                  <button
                    className="role-chip"
                    onClick={() => handleResetToSampleData()}
                    style={{ marginLeft: "auto", marginBottom: -1, borderRadius: "8px 8px 0 0" }}
                  >
                    🔄 重置数据
                  </button>
                </PermissionGate>
              </div>

              {activeTab === "caseRecords" && (
                <ProtectedMenu menu="menu.caseRecords">
                  <section>
                    <div className="section-heading">
                      <div>
                        <p>{project.domain}</p>
                        <h2>个案档案录入</h2>
                      </div>
                      <div className="section-actions">
                        <ProtectedButton
                          action="case.create"
                          className="primary-action"
                          onClick={openNewCaseForm}
                        >
                          新增个案记录
                        </ProtectedButton>
                      </div>
                    </div>

                    {isCaseFormOpen && editingCaseRecord && (
                  <div className="case-form-panel">
                    <div className="case-form-grid">
                      <label>
                        <span>来访者代号 *</span>
                        <ProtectedField field="case.clientCode" label={null}>
                          <input
                            value={editingCaseRecord.clientCode}
                            onChange={e => setEditingCaseRecord({ ...editingCaseRecord, clientCode: e.target.value })}
                            placeholder="例如：C-042"
                          />
                        </ProtectedField>
                      </label>
                      <label>
                        <span>咨询主题 *</span>
                        <input
                          value={editingCaseRecord.consultationTopic}
                          onChange={e => setEditingCaseRecord({ ...editingCaseRecord, consultationTopic: e.target.value })}
                          placeholder="例如：焦虑障碍"
                        />
                      </label>
                      <label>
                        <span>会谈日期</span>
                        <input
                          type="date"
                          value={editingCaseRecord.sessionDate}
                          onChange={e => setEditingCaseRecord({ ...editingCaseRecord, sessionDate: e.target.value })}
                        />
                      </label>
                      <label>
                        <span>情绪状态</span>
                        <select
                          value={editingCaseRecord.emotionalState}
                          onChange={e => setEditingCaseRecord({ ...editingCaseRecord, emotionalState: e.target.value })}
                        >
                          {emotionalOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </label>
                      <label className="case-form-full">
                        <span>主要困扰 *</span>
                        <textarea
                          value={editingCaseRecord.mainConcern}
                          onChange={e => setEditingCaseRecord({ ...editingCaseRecord, mainConcern: e.target.value })}
                          placeholder="描述来访者的主要困扰和问题表现"
                          rows={2}
                        />
                      </label>
                      <label className="case-form-full">
                        <span>干预方法 *</span>
                        <textarea
                          value={editingCaseRecord.intervention}
                          onChange={e => setEditingCaseRecord({ ...editingCaseRecord, intervention: e.target.value })}
                          placeholder="描述本次咨询采用的干预技术和方法"
                          rows={2}
                        />
                      </label>
                      <label className="case-form-full">
                        <span>下次目标</span>
                        <ProtectedField field="case.nextGoal" label={null}>
                          <textarea
                            value={editingCaseRecord.nextGoal}
                            onChange={e => setEditingCaseRecord({ ...editingCaseRecord, nextGoal: e.target.value })}
                            placeholder="描述下次咨询前的家庭作业或练习目标"
                            rows={2}
                          />
                        </ProtectedField>
                      </label>
                    </div>
                    <div className="case-form-actions">
                      <button onClick={handleCancelCaseForm}>取消</button>
                      <ProtectedButton
                        action={editingCaseRecord.id ? "case.edit" : "case.create"}
                        className="primary-action"
                        onClick={handleSaveCaseRecord}
                      >
                        {editingCaseRecord.id ? "更新记录" : "保存记录"}
                      </ProtectedButton>
                    </div>
                  </div>
                )}
              </section>

              <section style={{ marginTop: 24 }}>
                <div className="section-heading">
                  <div>
                    <p>个案档案</p>
                    <h2>近期记录</h2>
                    <p className="section-subtitle">
                      {hasCaseSearchFilters
                        ? `筛选结果 ${filteredCaseRecords.length} / ${caseRecords.length} 条记录`
                        : `共 ${caseRecords.length} 条记录，数据已自动保存到本地浏览器`}
                    </p>
                  </div>
                </div>

                <CaseSearchFilter
                  filters={caseSearchFilters}
                  onFiltersChange={setCaseSearchFilters}
                  onReset={resetCaseSearchFilters}
                  resultCount={filteredCaseRecords.length}
                  totalCount={caseRecords.length}
                  allClientCodes={activeClientCodes}
                  allTopics={caseSearchOptions.topics}
                  allEmotionalStates={caseSearchOptions.emotionalStates}
                  allInterventions={caseSearchOptions.interventions}
                  showToast={showToast}
                />

                <div className="record-list">
                  {caseRecords.length === 0 && (
                    <p className="tl-empty">暂无个案记录，点击「新增个案记录」开始录入</p>
                  )}
                  {caseRecords.length > 0 && filteredCaseRecords.length === 0 && (
                    <div className="case-search-empty">
                      <p className="case-search-empty-icon">🔍</p>
                      <p className="case-search-empty-text">没有找到匹配的个案记录</p>
                      <p className="case-search-empty-hint">请尝试调整筛选条件或清除部分关键词</p>
                      <button className="case-search-empty-btn" onClick={resetCaseSearchFilters}>清除所有筛选</button>
                    </div>
                  )}
                  {filteredCaseRecords
                    .slice()
                    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
                    .map((record, index) => {
                      const riskInfo = latestRiskByClient.get(record.clientCode);
                      return (
                        <article key={record.id} className="record-card">
                          <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                          <div className="record-body">
                            <div className="record-header">
                              <h3>{record.clientCode}</h3>
                              <span className="record-date">{record.sessionDate}</span>
                              <span className="record-topic">{record.consultationTopic}</span>
                              {riskInfo && (
                                <span className={`risk-badge-inline ${riskLevelColors[riskInfo.level]}`}>
                                  {riskLevelLabels[riskInfo.level]}
                                </span>
                              )}
                              {crisisWarningStats.byClient.has(record.clientCode) && (
                                <span className="cw-indicator-badge">
                                  🚨 {crisisWarningStatusLabels[crisisWarningStats.byClient.get(record.clientCode)!]}
                                </span>
                              )}
                            </div>
                            <p className="record-main-concern"><strong>主要困扰：</strong>{record.mainConcern}</p>
                            <p className="record-intervention"><strong>干预方法：</strong>{record.intervention}</p>
                            {record.nextGoal && (
                              <ProtectedField field="case.nextGoal" label={null}>
                                <p className="record-next-goal"><strong>下次目标：</strong>{record.nextGoal}</p>
                              </ProtectedField>
                            )}
                            <div className="record-meta-tags">
                              <span className="record-meta-tag">{record.emotionalState}</span>
                            </div>
                            <div className="record-actions">
                              <ProtectedButton
                                action="case.edit"
                                className="link"
                                onClick={() => openEditCaseForm(record)}
                              >
                                编辑
                              </ProtectedButton>
                              <ProtectedButton
                                action="case.delete"
                                className="link tl-btn-danger"
                                onClick={() => {
                                  if (confirm("确定删除此个案记录吗？")) handleDeleteCaseRecord(record.id);
                                }}
                              >
                                删除
                              </ProtectedButton>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                </div>
              </section>
                </ProtectedMenu>
              )}

              {activeTab === "risk" && (
                <ProtectedMenu menu="menu.riskAssessment">
                  <RiskAssessmentSection
                    assessments={assessments}
                    onAddAssessment={handleAddAssessment}
                    onDeleteAssessment={handleDeleteAssessment}
                    allClientCodes={activeClientCodes}
                  />
                </ProtectedMenu>
              )}

              {activeTab === "goals" && (
                <ProtectedMenu menu="menu.goalTracking">
                  <GoalTrackingSection
                    goals={goals}
                    onAddGoal={handleAddGoal}
                    onUpdateGoal={handleUpdateGoal}
                    onDeleteGoal={handleDeleteGoal}
                    allClientCodes={activeClientCodes}
                  />
                </ProtectedMenu>
              )}

              {activeTab === "timeline" && (
                <ProtectedMenu menu="menu.timeline">
                  <TimelineSection
                    clientCodes={activeClientCodes}
                    records={timeline}
                    onAddRecord={handleAddTimeline}
                    onUpdateRecord={handleUpdateTimeline}
                    onDeleteRecord={handleDeleteTimeline}
                    crisisWarningByClient={crisisWarningStats.byClient}
                  />
                </ProtectedMenu>
              )}

              {activeTab === "crisisWarning" && (
                <CrisisWarningSection
                  warnings={crisisWarnings}
                  onAddWarning={handleAddCrisisWarning}
                  onUpdateWarning={handleUpdateCrisisWarning}
                  onDeleteWarning={handleDeleteCrisisWarning}
                  allClientCodes={activeClientCodes}
                  role={currentRole}
                />
              )}

              {activeTab === "supervision" && (
                <ProtectedMenu menu="menu.supervision">
                  <SupervisionWorkbench
                    records={supervisionRecords}
                    role={currentRole}
                    onRoleChange={handleRoleChange}
                    onAddRecord={handleAddSupervisionRecord}
                    onUpdateRecord={handleUpdateSupervisionRecord}
                    onSubmitForSupervision={handleSubmitForSupervision}
                    onSaveDraft={handleSaveDraft}
                    onAddFeedback={handleAddFeedback}
                    crisisWarningByClient={crisisWarningStats.byClient}
                  />
                </ProtectedMenu>
              )}

              {activeTab === "export" && (
                <ProtectedMenu menu="menu.export">
                  <SessionSummaryExport
                    clientCodes={activeClientCodes}
                    timeline={timeline}
                    assessments={assessments}
                    goals={goals}
                    caseRecords={caseRecords}
                    onToast={showToast}
                  />
                </ProtectedMenu>
              )}

              <PermissionGate action="data.overview">
                <DataOverviewSection
                  timeline={timeline}
                  assessments={assessments}
                  goals={goals}
                  caseRecords={caseRecords}
                />
              </PermissionGate>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
