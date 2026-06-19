import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import "./styles.css";
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
}: {
  clientCodes: string[];
  records: TimelineRecord[];
  onAddRecord: (r: TimelineRecord) => void;
  onUpdateRecord: (r: TimelineRecord) => void;
  onDeleteRecord: (id: string) => void;
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

interface Toast {
  id: number;
  message: string;
  type: "error" | "success" | "info";
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

function App() {
  const [timeline, setTimeline] = useState<TimelineRecord[]>(initialTimelineData);
  const [assessments, setAssessments] = useState<RiskAssessment[]>(initialRiskAssessments);
  const [goals, setGoals] = useState<InterventionGoal[]>(initialGoals);
  const [caseRecords, setCaseRecords] = useState<CaseRecord[]>(initialCaseRecords);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dbStatus, setDbStatus] = useState<DBStatus>({ isSupported: true, isConnected: false, version: 0 });
  const [showDBUpgradeNotice, setShowDBUpgradeNotice] = useState(false);
  const [caseFormData, setCaseFormData] = useState<Record<string, string>>({});
  const [editingCaseRecord, setEditingCaseRecord] = useState<CaseRecord | null>(null);
  const [isCaseFormOpen, setIsCaseFormOpen] = useState(false);
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
          nextTimelineId,
          nextRiskId,
          nextGoalId,
          nextCaseRecordId
        );
        if (cancelled) return;
        setTimeline(data.timeline);
        setAssessments(data.riskAssessments);
        setGoals(data.goals);
        setCaseRecords(data.caseRecords);
        nextTimelineId = data.nextTimelineId;
        nextRiskId = data.nextRiskId;
        nextGoalId = data.nextGoalId;
        nextCaseRecordId = data.nextCaseRecordId;
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
      await saveCounters(nextTimelineId, nextRiskId, nextGoalId, nextCaseRecordId);
    } catch (err) {
      console.error("[DB] 保存计数器失败:", err);
    }
  }, [showToast]);

  const handleResetToSampleData = useCallback(async () => {
    if (!confirm("确定要重置所有数据吗？此操作将清空所有修改并恢复为示例数据。")) {
      return;
    }
    try {
      setIsLoading(true);
      const data = await resetToSampleData(
        initialTimelineData,
        initialRiskAssessments,
        initialGoals,
        initialCaseRecords,
        7,
        4,
        7,
        4
      );
      setTimeline(data.timeline);
      setAssessments(data.riskAssessments);
      setGoals(data.goals);
      setCaseRecords(data.caseRecords);
      nextTimelineId = data.nextTimelineId;
      nextRiskId = data.nextRiskId;
      nextGoalId = data.nextGoalId;
      nextCaseRecordId = data.nextCaseRecordId;
      showToast("数据已重置为示例数据", "success");
    } catch (err) {
      console.error("[DB] 重置数据失败:", err);
      showToast("重置数据失败");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const handleCaseFieldChange = useCallback((field: string, value: string) => {
    setCaseFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const openNewCaseForm = useCallback(() => {
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
  }, []);

  const openEditCaseForm = useCallback((record: CaseRecord) => {
    setEditingCaseRecord({ ...record });
    setIsCaseFormOpen(true);
  }, []);

  const handleSaveCaseRecord = useCallback(() => {
    if (!editingCaseRecord) return;
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
    } else {
      const newRecord = { ...finalRecord, id: "cr" + nextCaseRecordId++, createdAt: now };
      setCaseRecords(prev => [...prev, newRecord]);
      persistCaseRecord(newRecord);
      persistCounters();
    }
    setIsCaseFormOpen(false);
    setEditingCaseRecord(null);
    showToast("个案记录已保存", "success");
  }, [editingCaseRecord, persistCaseRecord, persistCounters, showToast]);

  const handleDeleteCaseRecord = useCallback((id: string) => {
    setCaseRecords(prev => prev.filter(r => r.id !== id));
    persistCaseRecordDelete(id);
    showToast("个案记录已删除", "info");
  }, [persistCaseRecordDelete, showToast]);

  const handleCancelCaseForm = useCallback(() => {
    setIsCaseFormOpen(false);
    setEditingCaseRecord(null);
  }, []);

  const handleAddTimeline = useCallback((record: TimelineRecord) => {
    setTimeline(prev => {
      const next = [...prev, record];
      persistTimeline(next);
      persistCounters();
      return next;
    });
  }, [persistTimeline, persistCounters]);

  const handleUpdateTimeline = useCallback((record: TimelineRecord) => {
    setTimeline(prev => {
      const next = prev.map(r => r.id === record.id ? record : r);
      persistTimeline(next);
      return next;
    });
  }, [persistTimeline]);

  const handleDeleteTimeline = useCallback((id: string) => {
    setTimeline(prev => prev.filter(r => r.id !== id));
    persistTimelineDelete(id);
  }, [persistTimelineDelete]);

  const handleAddAssessment = useCallback((a: RiskAssessment) => {
    setAssessments(prev => [...prev, a]);
    persistAssessment(a);
    persistCounters();
  }, [persistAssessment, persistCounters]);

  const handleDeleteAssessment = useCallback((id: string) => {
    setAssessments(prev => prev.filter(a => a.id !== id));
    persistAssessmentDelete(id);
  }, [persistAssessmentDelete]);

  const handleAddGoal = useCallback((g: InterventionGoal) => {
    setGoals(prev => [...prev, g]);
    persistGoal(g);
    persistCounters();
  }, [persistGoal, persistCounters]);

  const handleUpdateGoal = useCallback((g: InterventionGoal) => {
    setGoals(prev => prev.map(item => item.id === g.id ? g : item));
    persistGoal(g);
  }, [persistGoal]);

  const handleDeleteGoal = useCallback((id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    persistGoalDelete(id);
  }, [persistGoalDelete]);

  const { highRiskCount, mediumRiskCount, activeClientCodes } = useMemo(() => {
    const latestByClient = new Map<string, RiskAssessment>();
    for (const a of assessments) {
      const existing = latestByClient.get(a.clientCode);
      if (!existing || existing.assessDate < a.assessDate) {
        latestByClient.set(a.clientCode, a);
      }
    }
    let high = 0;
    let medium = 0;
    for (const a of latestByClient.values()) {
      if (a.level === "high") high++;
      else if (a.level === "medium") medium++;
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
      activeClientCodes: allCodes
    };
  }, [assessments, goals, timeline, caseRecords]);

  const goalProgressCount = useMemo(() => {
    const activeGoals = goals.filter(g => g.status === "active");
    if (activeGoals.length === 0) return "0";
    const total = activeGoals.reduce((s, g) => s + g.totalSteps, 0);
    const completed = activeGoals.reduce((s, g) => s + g.completedSteps, 0);
    return total > 0 ? String(Math.round((completed / total) * 100)) + "%" : "0%";
  }, [goals]);

  const metricValues = useMemo(() => {
    return [
      String(activeClientCodes.length + 78),
      String(highRiskCount + mediumRiskCount),
      "31",
      goalProgressCount
    ];
  }, [activeClientCodes.length, highRiskCount, mediumRiskCount, goalProgressCount]);

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
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            {project.filters.map((filter: string) => (
              <button key={filter}>{filter}</button>
            ))}
          </div>
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
              <strong className="risk-dist-count">
                {activeClientCodes.filter(c => {
                  const lat = assessments.filter(a => a.clientCode === c).sort((a,b) => b.assessDate.localeCompare(a.assessDate))[0];
                  return lat?.level === "watch";
                }).length}
              </strong>
            </div>
            <div className="risk-dist-item">
              <span className={`risk-dot ${riskLevelColors.stable}`} />
              <span className="risk-dist-label">稳定</span>
              <strong className="risk-dist-count">
                {activeClientCodes.filter(c => {
                  const lat = assessments.filter(a => a.clientCode === c).sort((a,b) => b.assessDate.localeCompare(a.assessDate))[0];
                  return lat?.level === "stable";
                }).length}
              </strong>
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

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>个案档案录入</h2>
            </div>
            <div className="section-actions">
              <button className="secondary-action" onClick={handleResetToSampleData}>重置示例数据</button>
              <button className="primary-action" onClick={openNewCaseForm}>新增个案记录</button>
            </div>
          </div>

          {isCaseFormOpen && editingCaseRecord && (
            <div className="case-form-panel">
              <div className="case-form-grid">
                <label>
                  <span>来访者代号 *</span>
                  <input
                    value={editingCaseRecord.clientCode}
                    onChange={e => setEditingCaseRecord({ ...editingCaseRecord, clientCode: e.target.value })}
                    placeholder="例如：C-042"
                  />
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
                  <textarea
                    value={editingCaseRecord.nextGoal}
                    onChange={e => setEditingCaseRecord({ ...editingCaseRecord, nextGoal: e.target.value })}
                    placeholder="描述下次咨询前的家庭作业或练习目标"
                    rows={2}
                  />
                </label>
              </div>
              <div className="case-form-actions">
                <button onClick={handleCancelCaseForm}>取消</button>
                <button className="primary-action" onClick={handleSaveCaseRecord}>
                  {editingCaseRecord.id ? "更新记录" : "保存记录"}
                </button>
              </div>
            </div>
          )}
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>个案档案</p>
            <h2>近期记录</h2>
            <p className="section-subtitle">共 {caseRecords.length} 条记录，数据已自动保存到本地浏览器</p>
          </div>
          <button className="secondary-action">导出摘要</button>
        </div>
        <div className="record-list">
          {caseRecords.length === 0 && (
            <p className="tl-empty">暂无个案记录，点击「新增个案记录」开始录入</p>
          )}
          {caseRecords
            .slice()
            .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
            .map((record, index) => (
            <article key={record.id} className="record-card">
              <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="record-body">
                <div className="record-header">
                  <h3>{record.clientCode}</h3>
                  <span className="record-date">{record.sessionDate}</span>
                  <span className="record-topic">{record.consultationTopic}</span>
                </div>
                <p className="record-main-concern"><strong>主要困扰：</strong>{record.mainConcern}</p>
                <p className="record-intervention"><strong>干预方法：</strong>{record.intervention}</p>
                {record.nextGoal && (
                  <p className="record-next-goal"><strong>下次目标：</strong>{record.nextGoal}</p>
                )}
                <div className="record-actions">
                  <button onClick={() => openEditCaseForm(record)}>编辑</button>
                  <button className="tl-btn-danger" onClick={() => handleDeleteCaseRecord(record.id)}>删除</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <RiskAssessmentSection
        assessments={assessments}
        onAddAssessment={handleAddAssessment}
        onDeleteAssessment={handleDeleteAssessment}
        allClientCodes={activeClientCodes}
      />

      <GoalTrackingSection
        goals={goals}
        onAddGoal={handleAddGoal}
        onUpdateGoal={handleUpdateGoal}
        onDeleteGoal={handleDeleteGoal}
        allClientCodes={activeClientCodes}
      />

      <TimelineSection
        clientCodes={activeClientCodes}
        records={timeline}
        onAddRecord={handleAddTimeline}
        onUpdateRecord={handleUpdateTimeline}
        onDeleteRecord={handleDeleteTimeline}
      />
    </main>
  );
}

export default App;
