import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  loadAllData,
  saveTimelineRecord,
  saveTimelineRecords,
  deleteTimelineRecord as dbDeleteTimeline,
  saveRiskAssessment,
  deleteRiskAssessment as dbDeleteRisk,
  saveGoal,
  deleteGoal as dbDeleteGoal,
  saveCaseRecord,
  deleteCaseRecord as dbDeleteCaseRecord,
  saveCrisisWarning,
  deleteCrisisWarning as dbDeleteCrisisWarning,
  saveCounters,
  resetToSampleData as dbResetToSampleData,
  loadCrisisStrategy,
  saveCrisisStrategy as dbSaveCrisisStrategy,
  addDBListener,
  getDBStatus,
  checkDBSupport,
  type AppData,
  type DBStatus,
  type DBEventType,
} from "../db";
import type {
  TimelineRecord,
  RiskAssessment,
  InterventionGoal,
  CaseRecord,
  SupervisionRecord,
  SupervisionFeedback,
  CrisisWarning,
  CrisisWarningAction,
  CrisisStrategy,
} from "../App";

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
    nextPracticeDate: "2026-06-15",
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
    nextPracticeDate: "2026-06-21",
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

const DEFAULT_CRISIS_STRATEGY: CrisisStrategy = {
  id: "default",
  name: "默认预警策略",
  keywords: ["自伤", "自杀", "自残", "失控", "轻生", "寻死", "不想活", "伤害自己", "结束生命", "崩溃"],
  riskLevelTriggers: ["high"],
  dimensionThresholds: [
    { dimension: "selfHarm", minScore: 3 },
  ],
  suppressionWindowMinutes: 30,
  statusTimeLimits: [
    { status: "pending", hours: 24 },
    { status: "confirmed", hours: 48 },
    { status: "escalated", hours: 72 },
    { status: "referred", hours: 168 },
  ],
  updatedAt: new Date().toISOString(),
  updatedBy: "系统",
};

export interface UseAppDataOptions {
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
  onDBEvent?: (event: DBEventType, data?: unknown) => void;
}

export interface UseAppDataReturn {
  timeline: TimelineRecord[];
  assessments: RiskAssessment[];
  goals: InterventionGoal[];
  caseRecords: CaseRecord[];
  supervisionRecords: SupervisionRecord[];
  crisisWarnings: CrisisWarning[];
  crisisStrategy: CrisisStrategy;
  isLoading: boolean;
  dbStatus: DBStatus;
  isDBSupported: boolean;

  addTimeline: (record: Omit<TimelineRecord, "id"> & { id?: string }) => TimelineRecord;
  updateTimeline: (record: TimelineRecord) => void;
  deleteTimeline: (id: string) => void;

  addAssessment: (assessment: Omit<RiskAssessment, "id"> & { id?: string }) => RiskAssessment;
  deleteAssessment: (id: string) => void;

  addGoal: (goal: Omit<InterventionGoal, "id"> & { id?: string }) => InterventionGoal;
  updateGoal: (goal: InterventionGoal) => void;
  deleteGoal: (id: string) => void;

  addCaseRecord: (record: Omit<CaseRecord, "id"> & { id?: string }) => CaseRecord;
  updateCaseRecord: (record: CaseRecord) => void;
  deleteCaseRecord: (id: string) => void;

  addSupervisionRecord: (record: Omit<SupervisionRecord, "id"> & { id?: string }) => SupervisionRecord;
  updateSupervisionRecord: (record: SupervisionRecord) => void;
  submitForSupervision: (record: SupervisionRecord) => void;
  addFeedback: (recordId: string, feedback: SupervisionFeedback) => SupervisionRecord | null;

  addCrisisWarning: (warning: Omit<CrisisWarning, "id"> & { id?: string }) => CrisisWarning;
  updateCrisisWarning: (warning: CrisisWarning) => void;
  deleteCrisisWarning: (id: string) => void;

  saveCrisisStrategy: (strategy: CrisisStrategy) => void;

  resetToSampleData: () => Promise<void>;
  refreshFromDB: () => Promise<void>;

  generateTimelineId: () => string;
  generateRiskId: () => string;
  generateGoalId: () => string;
  generateCaseRecordId: () => string;
  generateCrisisWarningId: () => string;
  generateSupervisionId: () => string;
  generateFeedbackId: () => string;
  generateClipId: () => string;
  generateCrisisWarningActionId: () => string;

  getCounters: () => {
    nextTimelineId: number;
    nextRiskId: number;
    nextGoalId: number;
    nextCaseRecordId: number;
    nextCrisisWarningId: number;
    nextCrisisWarningActionId: number;
    nextSupervisionId: number;
    nextFeedbackId: number;
    nextClipId: number;
  };
}

export function useAppData(options: UseAppDataOptions = {}): UseAppDataReturn {
  const { onError, onSuccess, onDBEvent } = options;

  const [timeline, setTimeline] = useState<TimelineRecord[]>(initialTimelineData);
  const [assessments, setAssessments] = useState<RiskAssessment[]>(initialRiskAssessments);
  const [goals, setGoals] = useState<InterventionGoal[]>(initialGoals);
  const [caseRecords, setCaseRecords] = useState<CaseRecord[]>(initialCaseRecords);
  const [supervisionRecords, setSupervisionRecords] = useState<SupervisionRecord[]>(initialSupervisionRecords);
  const [crisisWarnings, setCrisisWarnings] = useState<CrisisWarning[]>(initialCrisisWarnings);
  const [crisisStrategy, setCrisisStrategy] = useState<CrisisStrategy>(DEFAULT_CRISIS_STRATEGY);
  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<DBStatus>({ isSupported: true, isConnected: false, version: 0 });

  const nextTimelineIdRef = useRef(7);
  const nextRiskIdRef = useRef(4);
  const nextGoalIdRef = useRef(7);
  const nextCaseRecordIdRef = useRef(4);
  const nextCrisisWarningIdRef = useRef(3);
  const nextSupervisionIdRef = useRef(4);
  const nextFeedbackIdRef = useRef(2);
  const nextClipIdRef = useRef(4);
  const nextCrisisWarningActionIdRef = useRef(4);

  const isLoadedRef = useRef(false);
  const isDBSupported = useMemo(() => checkDBSupport(), []);

  const handleError = useCallback((message: string) => {
    if (onError) {
      onError(message);
    } else {
      console.error("[useAppData]", message);
    }
  }, [onError]);

  const handleSuccess = useCallback((message: string) => {
    if (onSuccess) {
      onSuccess(message);
    }
  }, [onSuccess]);

  const handleDBEvent = useCallback((event: DBEventType, data?: unknown) => {
    if (onDBEvent) {
      onDBEvent(event, data);
    }
  }, [onDBEvent]);

  const persistCounters = useCallback(async () => {
    try {
      await saveCounters(
        nextTimelineIdRef.current,
        nextRiskIdRef.current,
        nextGoalIdRef.current,
        nextCaseRecordIdRef.current,
        nextCrisisWarningIdRef.current
      );
    } catch (err) {
      console.error("[DB] 保存计数器失败:", err);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (isLoadedRef.current) return;
    let cancelled = false;

    try {
      const data = await loadAllData(
        initialTimelineData,
        initialRiskAssessments,
        initialGoals,
        initialCaseRecords,
        initialCrisisWarnings,
        nextTimelineIdRef.current,
        nextRiskIdRef.current,
        nextGoalIdRef.current,
        nextCaseRecordIdRef.current,
        nextCrisisWarningIdRef.current
      );
      if (cancelled) return;

      setTimeline(data.timeline);
      setAssessments(data.riskAssessments);
      setGoals(data.goals);
      setCaseRecords(data.caseRecords);
      setCrisisWarnings(data.crisisWarnings);

      nextTimelineIdRef.current = data.nextTimelineId;
      nextRiskIdRef.current = data.nextRiskId;
      nextGoalIdRef.current = data.nextGoalId;
      nextCaseRecordIdRef.current = data.nextCaseRecordId;
      nextCrisisWarningIdRef.current = data.nextCrisisWarningId;

      try {
        const savedStrategy = await loadCrisisStrategy(DEFAULT_CRISIS_STRATEGY);
        setCrisisStrategy(savedStrategy);
      } catch (e) {
        console.warn("[DB] 加载预警策略失败，使用默认策略:", e);
      }

      isLoadedRef.current = true;
      setIsLoading(false);
      handleSuccess("个案档案数据加载完成");
    } catch (err) {
      if (cancelled) return;
      console.error("[DB] 加载数据失败:", err);
      const errorMsg = err instanceof Error ? err.message : "未知错误";
      handleError(`数据加载失败：${errorMsg}，已使用本地示例数据`);
      isLoadedRef.current = true;
      setIsLoading(false);
    }

    return () => { cancelled = true; };
  }, [handleError, handleSuccess]);

  const internalHandleDBEvent = useCallback((event: DBEventType, data?: unknown) => {
    if (event === "success") {
      const successData = data as { version?: number };
      if (successData?.version) {
        setDbStatus(prev => ({ ...prev, version: successData.version!, isConnected: true }));
      }
    }
    handleDBEvent(event, data);
  }, [handleDBEvent]);

  useEffect(() => {
    const removeListener = addDBListener(internalHandleDBEvent);

    (async () => {
      const status = await getDBStatus();
      setDbStatus(status);
      if (!status.isSupported) {
        handleError("当前浏览器不支持离线存储功能，请使用现代浏览器");
      }
    })();

    return () => { removeListener(); };
  }, [internalHandleDBEvent, handleError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const generateTimelineId = useCallback(() => {
    return String(nextTimelineIdRef.current++);
  }, []);

  const generateRiskId = useCallback(() => {
    return "ra" + nextRiskIdRef.current++;
  }, []);

  const generateGoalId = useCallback(() => {
    return "g" + nextGoalIdRef.current++;
  }, []);

  const generateCaseRecordId = useCallback(() => {
    return "cr" + nextCaseRecordIdRef.current++;
  }, []);

  const generateCrisisWarningId = useCallback(() => {
    return "cw" + nextCrisisWarningIdRef.current++;
  }, []);

  const generateSupervisionId = useCallback(() => {
    return "sv" + nextSupervisionIdRef.current++;
  }, []);

  const generateFeedbackId = useCallback(() => {
    return "fb" + nextFeedbackIdRef.current++;
  }, []);

  const generateClipId = useCallback(() => {
    return "clip" + nextClipIdRef.current++;
  }, []);

  const generateCrisisWarningActionId = useCallback(() => {
    return "cwa" + nextCrisisWarningActionIdRef.current++;
  }, []);

  const addTimeline = useCallback((record: Omit<TimelineRecord, "id"> & { id?: string }): TimelineRecord => {
    const id = record.id || generateTimelineId();
    const newRecord = { ...record, id } as TimelineRecord;
    setTimeline(prev => [...prev, newRecord]);
    saveTimelineRecord(newRecord).catch(err => {
      console.error("[DB] 保存时间线失败:", err);
      handleError("时间线数据保存失败，请检查浏览器存储");
    });
    persistCounters();
    return newRecord;
  }, [generateTimelineId, handleError, persistCounters]);

  const updateTimeline = useCallback((record: TimelineRecord) => {
    setTimeline(prev => prev.map(r => r.id === record.id ? record : r));
    saveTimelineRecord(record).catch(err => {
      console.error("[DB] 保存时间线失败:", err);
      handleError("时间线数据保存失败");
    });
  }, [handleError]);

  const deleteTimeline = useCallback((id: string) => {
    setTimeline(prev => prev.filter(r => r.id !== id));
    dbDeleteTimeline(id).catch(err => {
      console.error("[DB] 删除时间线记录失败:", err);
      handleError("删除时间线记录失败");
    });
  }, [handleError]);

  const addAssessment = useCallback((assessment: Omit<RiskAssessment, "id"> & { id?: string }): RiskAssessment => {
    const id = assessment.id || generateRiskId();
    const newAssessment = { ...assessment, id } as RiskAssessment;
    setAssessments(prev => [...prev, newAssessment]);
    saveRiskAssessment(newAssessment).catch(err => {
      console.error("[DB] 保存风险评估失败:", err);
      handleError("风险评估数据保存失败");
    });
    persistCounters();
    return newAssessment;
  }, [generateRiskId, handleError, persistCounters]);

  const deleteAssessment = useCallback((id: string) => {
    setAssessments(prev => prev.filter(a => a.id !== id));
    dbDeleteRisk(id).catch(err => {
      console.error("[DB] 删除风险评估失败:", err);
      handleError("删除风险评估记录失败");
    });
  }, [handleError]);

  const addGoal = useCallback((goal: Omit<InterventionGoal, "id"> & { id?: string }): InterventionGoal => {
    const id = goal.id || generateGoalId();
    const newGoal = { ...goal, id } as InterventionGoal;
    setGoals(prev => [...prev, newGoal]);
    saveGoal(newGoal).catch(err => {
      console.error("[DB] 保存目标失败:", err);
      handleError("目标数据保存失败");
    });
    persistCounters();
    return newGoal;
  }, [generateGoalId, handleError, persistCounters]);

  const updateGoal = useCallback((goal: InterventionGoal) => {
    setGoals(prev => prev.map(g => g.id === goal.id ? goal : g));
    saveGoal(goal).catch(err => {
      console.error("[DB] 保存目标失败:", err);
      handleError("目标数据保存失败");
    });
  }, [handleError]);

  const deleteGoal = useCallback((id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    dbDeleteGoal(id).catch(err => {
      console.error("[DB] 删除目标失败:", err);
      handleError("删除目标记录失败");
    });
  }, [handleError]);

  const addCaseRecord = useCallback((record: Omit<CaseRecord, "id"> & { id?: string }): CaseRecord => {
    const id = record.id || generateCaseRecordId();
    const newRecord = { ...record, id } as CaseRecord;
    setCaseRecords(prev => [...prev, newRecord]);
    saveCaseRecord(newRecord).catch(err => {
      console.error("[DB] 保存个案记录失败:", err);
      handleError("个案记录保存失败");
    });
    persistCounters();
    return newRecord;
  }, [generateCaseRecordId, handleError, persistCounters]);

  const updateCaseRecord = useCallback((record: CaseRecord) => {
    setCaseRecords(prev => prev.map(r => r.id === record.id ? record : r));
    saveCaseRecord(record).catch(err => {
      console.error("[DB] 保存个案记录失败:", err);
      handleError("个案记录保存失败");
    });
  }, [handleError]);

  const deleteCaseRecord = useCallback((id: string) => {
    setCaseRecords(prev => prev.filter(r => r.id !== id));
    dbDeleteCaseRecord(id).catch(err => {
      console.error("[DB] 删除个案记录失败:", err);
      handleError("删除个案记录失败");
    });
  }, [handleError]);

  const addSupervisionRecord = useCallback((record: Omit<SupervisionRecord, "id"> & { id?: string }): SupervisionRecord => {
    const id = record.id || generateSupervisionId();
    const newRecord = { ...record, id } as SupervisionRecord;
    setSupervisionRecords(prev => [...prev, newRecord]);
    return newRecord;
  }, [generateSupervisionId]);

  const updateSupervisionRecord = useCallback((record: SupervisionRecord) => {
    setSupervisionRecords(prev => prev.map(r => r.id === record.id ? record : r));
  }, []);

  const submitForSupervision = useCallback((record: SupervisionRecord) => {
    setSupervisionRecords(prev => prev.map(r => r.id === record.id ? record : r));
  }, []);

  const addFeedback = useCallback((recordId: string, feedback: SupervisionFeedback): SupervisionRecord | null => {
    let updatedRecord: SupervisionRecord | null = null;
    setSupervisionRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      updatedRecord = {
        ...r,
        status: "feedback",
        feedbackHistory: [...r.feedbackHistory, feedback],
        lastFeedbackAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return updatedRecord;
    }));
    return updatedRecord;
  }, []);

  const addCrisisWarning = useCallback((warning: Omit<CrisisWarning, "id"> & { id?: string }): CrisisWarning => {
    const id = warning.id || generateCrisisWarningId();
    const newWarning = { ...warning, id } as CrisisWarning;
    setCrisisWarnings(prev => [...prev, newWarning]);
    saveCrisisWarning(newWarning).catch(err => {
      console.error("[DB] 保存危机预警失败:", err);
      handleError("危机预警数据保存失败");
    });
    persistCounters();
    return newWarning;
  }, [generateCrisisWarningId, handleError, persistCounters]);

  const updateCrisisWarning = useCallback((warning: CrisisWarning) => {
    setCrisisWarnings(prev => prev.map(w => w.id === warning.id ? warning : w));
    saveCrisisWarning(warning).catch(err => {
      console.error("[DB] 保存危机预警失败:", err);
      handleError("危机预警数据保存失败");
    });
  }, [handleError]);

  const deleteCrisisWarning = useCallback((id: string) => {
    setCrisisWarnings(prev => prev.filter(w => w.id !== id));
    dbDeleteCrisisWarning(id).catch(err => {
      console.error("[DB] 删除危机预警失败:", err);
      handleError("删除危机预警记录失败");
    });
  }, [handleError]);

  const saveCrisisStrategy = useCallback((strategy: CrisisStrategy) => {
    setCrisisStrategy(strategy);
    dbSaveCrisisStrategy(strategy).catch(err => {
      console.error("[DB] 保存预警策略失败:", err);
      handleError("预警策略保存失败");
    });
  }, [handleError]);

  const resetToSampleData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await dbResetToSampleData(
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

      nextTimelineIdRef.current = data.nextTimelineId;
      nextRiskIdRef.current = data.nextRiskId;
      nextGoalIdRef.current = data.nextGoalId;
      nextCaseRecordIdRef.current = data.nextCaseRecordId;
      nextCrisisWarningIdRef.current = data.nextCrisisWarningId;

      handleSuccess("数据已重置为示例数据");
    } catch (err) {
      console.error("[DB] 重置数据失败:", err);
      handleError("重置数据失败");
    } finally {
      setIsLoading(false);
    }
  }, [handleError, handleSuccess]);

  const refreshFromDB = useCallback(async () => {
    isLoadedRef.current = false;
    setIsLoading(true);
    await loadData();
  }, [loadData]);

  return {
    timeline,
    assessments,
    goals,
    caseRecords,
    supervisionRecords,
    crisisWarnings,
    crisisStrategy,
    isLoading,
    dbStatus,
    isDBSupported,

    addTimeline,
    updateTimeline,
    deleteTimeline,

    addAssessment,
    deleteAssessment,

    addGoal,
    updateGoal,
    deleteGoal,

    addCaseRecord,
    updateCaseRecord,
    deleteCaseRecord,

    addSupervisionRecord,
    updateSupervisionRecord,
    submitForSupervision,
    addFeedback,

    addCrisisWarning,
    updateCrisisWarning,
    deleteCrisisWarning,

    saveCrisisStrategy,

    resetToSampleData,
    refreshFromDB,

    generateTimelineId,
    generateRiskId,
    generateGoalId,
    generateCaseRecordId,
    generateCrisisWarningId,
    generateSupervisionId,
    generateFeedbackId,
    generateClipId,
    generateCrisisWarningActionId,

    getCounters: useCallback(() => ({
      nextTimelineId: nextTimelineIdRef.current,
      nextRiskId: nextRiskIdRef.current,
      nextGoalId: nextGoalIdRef.current,
      nextCaseRecordId: nextCaseRecordIdRef.current,
      nextCrisisWarningId: nextCrisisWarningIdRef.current,
      nextCrisisWarningActionId: nextCrisisWarningActionIdRef.current,
      nextSupervisionId: nextSupervisionIdRef.current,
      nextFeedbackId: nextFeedbackIdRef.current,
      nextClipId: nextClipIdRef.current,
    }), []),
  };
}
