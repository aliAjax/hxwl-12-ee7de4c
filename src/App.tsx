import { useState } from "react";
import "./styles.css";

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

interface TimelineRecord {
  id: string;
  clientCode: string;
  sessionDate: string;
  topic: string;
  emotionalState: string;
  intervention: string;
  nextGoal: string;
}

const initialTimelineData: TimelineRecord[] = [
  { id: "1", clientCode: "C-042", sessionDate: "2026-06-10", topic: "焦虑", emotionalState: "紧张不安", intervention: "呼吸放松训练", nextGoal: "觉察焦虑触发场景" },
  { id: "2", clientCode: "C-042", sessionDate: "2026-06-03", topic: "焦虑", emotionalState: "恐惧加剧", intervention: "认知重构", nextGoal: "练习呼吸放松" },
  { id: "3", clientCode: "C-119", sessionDate: "2026-06-09", topic: "亲密关系", emotionalState: "低落委屈", intervention: "沟通模式分析", nextGoal: "尝试非暴力沟通表达" },
  { id: "4", clientCode: "C-119", sessionDate: "2026-05-26", topic: "亲密关系", emotionalState: "回避防御", intervention: "依恋风格探索", nextGoal: "识别回避模式" },
  { id: "5", clientCode: "C-203", sessionDate: "2026-06-11", topic: "职业压力", emotionalState: "疲惫烦躁", intervention: "边界设定练习", nextGoal: "制定工作时间边界" },
  { id: "6", clientCode: "C-203", sessionDate: "2026-05-28", topic: "职业压力", emotionalState: "焦虑无助", intervention: "压力源梳理", nextGoal: "设定下周边界练习" },
];

const emotionalOptions = ["平静", "低落", "焦虑", "紧张不安", "恐惧加剧", "回避防御", "低落委屈", "疲惫烦躁", "焦虑无助", "愤怒", "麻木"];

let nextId = 7;

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function TimelineSection() {
  const [records, setRecords] = useState<TimelineRecord[]>(initialTimelineData);
  const [selectedClient, setSelectedClient] = useState<string>("C-042");
  const [editingRecord, setEditingRecord] = useState<TimelineRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const clientCodes = Array.from(new Set(records.map(r => r.clientCode)));
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
      setRecords(prev => prev.map(r => r.id === editingRecord.id ? editingRecord : r));
    } else {
      const newRecord = { ...editingRecord, id: String(nextId++) };
      setRecords(prev => [...prev, newRecord]);
    }
    setIsFormOpen(false);
    setEditingRecord(null);
  };

  const handleDelete = (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
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
        {clientCodes.map(code => (
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

function App() {
  const values = project.metrics.map((metric: string, index: number) => {
    const base = [84, 12, 31, 7][index % 4];
    return String(base + index * 3);
  });

  return (
    <main className="app-shell">
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
          <MetricCard key={metric} label={metric} value={values[index]} index={index} />
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
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>记录字段</h2>
            </div>
            <button className="primary-action">新增记录</button>
          </div>
          <div className="field-grid">
            {project.fields.map((field: string) => (
              <label key={field}>
                <span>{field}</span>
                <input placeholder={"填写" + field} />
              </label>
            ))}
          </div>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>示例数据</p>
            <h2>近期记录</h2>
          </div>
          <button>导出摘要</button>
        </div>
        <div className="record-list">
          {project.records.map((record: string[], index: number) => (
            <article key={record.join("-")} className="record-card">
              <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{record[0]}</h3>
                <p>{record.slice(1).join(" · ")}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <TimelineSection />
    </main>
  );
}

export default App;
