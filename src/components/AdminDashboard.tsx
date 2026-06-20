import { useState, useMemo, useCallback } from "react";
import {
  TimelineRecord,
  RiskAssessment,
  InterventionGoal,
  CaseRecord,
  CrisisWarning,
  RiskLevel,
  riskLevelLabels,
  riskLevelColors,
  crisisWarningStatusLabels,
} from "../App";
import { useAuth, createAuditLog } from "../auth";

interface DashboardDrillFilter {
  type: "activeCases" | "highRisk" | "pendingCrisis" | "goalCompletion" | "topic" | "sessionTrend";
  value?: string;
  date?: string;
}

interface ActiveCaseSummary {
  clientCode: string;
  latestSessionDate: string;
  sessionCount30Days: number;
  currentRiskLevel: RiskLevel | null;
  activeGoals: number;
  consultationTopic: string;
}

interface HighRiskCaseSummary {
  clientCode: string;
  riskLevel: RiskLevel;
  riskScore: number;
  assessDate: string;
  hasActiveWarning: boolean;
  consultationTopic: string;
}

interface PendingCrisisSummary {
  id: string;
  clientCode: string;
  triggerType: string;
  createdAt: string;
  status: string;
}

interface GoalCompletionDetail {
  clientCode: string;
  totalGoals: number;
  completedGoals: number;
  activeGoals: number;
  avgProgress: number;
  lastActionDate: string;
}

interface SessionTrendDetail {
  date: string;
  sessionCount: number;
  clientCodes: string[];
  topics: string[];
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateRange30Days(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function isWithin30Days(dateStr: string): boolean {
  if (!dateStr) return false;
  const { start, end } = getDateRange30Days();
  const d = parseLocalDate(dateStr);
  return d >= start && d <= end;
}

function compareRiskTime(a: RiskAssessment, b: RiskAssessment): number {
  const aTime = a.createdAt ?? a.assessDate;
  const bTime = b.createdAt ?? b.assessDate;
  return bTime.localeCompare(aTime);
}

function isRiskNewer(a: RiskAssessment, b: RiskAssessment): boolean {
  return compareRiskTime(a, b) < 0;
}

interface AdminDashboardProps {
  timeline: TimelineRecord[];
  assessments: RiskAssessment[];
  goals: InterventionGoal[];
  caseRecords: CaseRecord[];
  crisisWarnings: CrisisWarning[];
  role: "counselor" | "supervisor" | "admin";
}

export default function AdminDashboard({
  timeline,
  assessments,
  goals,
  caseRecords,
  crisisWarnings,
  role,
}: AdminDashboardProps) {
  const { session } = useAuth();
  const [drillFilter, setDrillFilter] = useState<DashboardDrillFilter | null>(null);

  const dashboardData = useMemo(() => {
    const { start, end } = getDateRange30Days();

    const allClientCodes = new Set<string>();
    timeline.forEach(r => allClientCodes.add(r.clientCode));
    caseRecords.forEach(r => allClientCodes.add(r.clientCode));
    assessments.forEach(r => allClientCodes.add(r.clientCode));
    goals.forEach(r => allClientCodes.add(r.clientCode));

    const latestRiskByClient = new Map<string, RiskAssessment>();
    assessments.forEach(a => {
      const existing = latestRiskByClient.get(a.clientCode);
      if (!existing || isRiskNewer(a, existing)) {
        latestRiskByClient.set(a.clientCode, a);
      }
    });

    const clientTopicMap = new Map<string, string>();
    caseRecords.forEach(r => {
      if (r.consultationTopic && !clientTopicMap.has(r.clientCode)) {
        clientTopicMap.set(r.clientCode, r.consultationTopic);
      }
    });
    timeline.forEach(r => {
      if (r.topic && !clientTopicMap.has(r.clientCode)) {
        clientTopicMap.set(r.clientCode, r.topic);
      }
    });

    const activeCaseSummaries: ActiveCaseSummary[] = [];
    allClientCodes.forEach(code => {
      const clientTimeline = timeline.filter(r => r.clientCode === code && isWithin30Days(r.sessionDate));
      const clientCases = caseRecords.filter(r => r.clientCode === code && isWithin30Days(r.sessionDate));
      const sessionCount30Days = clientTimeline.length + clientCases.length;

      if (sessionCount30Days > 0) {
        const allDates = [...clientTimeline.map(r => r.sessionDate), ...clientCases.map(r => r.sessionDate)];
        const latestSessionDate = allDates.sort((a, b) => b.localeCompare(a))[0];
        const currentRisk = latestRiskByClient.get(code) || null;
        const activeGoals = goals.filter(g => g.clientCode === code && g.status === "active").length;

        activeCaseSummaries.push({
          clientCode: code,
          latestSessionDate,
          sessionCount30Days,
          currentRiskLevel: currentRisk?.level || null,
          activeGoals,
          consultationTopic: clientTopicMap.get(code) || "未分类",
        });
      }
    });

    const highRiskCaseSummaries: HighRiskCaseSummary[] = [];
    latestRiskByClient.forEach((assessment, code) => {
      if (assessment.level === "high" || assessment.level === "medium") {
        const hasActiveWarning = crisisWarnings.some(
          w => w.clientCode === code && w.status !== "closed"
        );
        highRiskCaseSummaries.push({
          clientCode: code,
          riskLevel: assessment.level,
          riskScore: assessment.totalScore,
          assessDate: assessment.assessDate,
          hasActiveWarning,
          consultationTopic: clientTopicMap.get(code) || "未分类",
        });
      }
    });
    highRiskCaseSummaries.sort((a, b) => {
      const levelOrder: Record<RiskLevel, number> = { high: 0, medium: 1, watch: 2, stable: 3 };
      return levelOrder[a.riskLevel] - levelOrder[b.riskLevel] || b.riskScore - a.riskScore;
    });

    const pendingCrisisSummaries: PendingCrisisSummary[] = crisisWarnings
      .filter(w => w.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(w => ({
        id: w.id,
        clientCode: w.clientCode,
        triggerType: w.triggerType === "risk_assessment" ? "风险评估" : "个案记录",
        createdAt: w.createdAt,
        status: crisisWarningStatusLabels[w.status],
      }));

    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.status === "completed").length;
    const activeGoals = goals.filter(g => g.status === "active").length;
    const totalSteps = goals.reduce((s, g) => s + g.totalSteps, 0);
    const completedSteps = goals.reduce((s, g) => s + g.completedSteps, 0);
    const goalCompletionRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
    const avgGoalProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    const goalDetailsByClient = new Map<string, {
      total: number;
      completed: number;
      active: number;
      totalSteps: number;
      completedSteps: number;
      lastDate: string;
    }>();

    goals.forEach(g => {
      const entry = goalDetailsByClient.get(g.clientCode) || {
        total: 0, completed: 0, active: 0, totalSteps: 0, completedSteps: 0, lastDate: ""
      };
      entry.total++;
      if (g.status === "completed") entry.completed++;
      if (g.status === "active") entry.active++;
      entry.totalSteps += g.totalSteps;
      entry.completedSteps += g.completedSteps;
      if (g.lastActionDate > entry.lastDate) entry.lastDate = g.lastActionDate;
      goalDetailsByClient.set(g.clientCode, entry);
    });

    const goalCompletionDetails: GoalCompletionDetail[] = Array.from(goalDetailsByClient.entries())
      .map(([clientCode, data]) => ({
        clientCode,
        totalGoals: data.total,
        completedGoals: data.completed,
        activeGoals: data.active,
        avgProgress: data.totalSteps > 0 ? Math.round((data.completedSteps / data.totalSteps) * 100) : 0,
        lastActionDate: data.lastDate,
      }))
      .sort((a, b) => b.totalGoals - a.totalGoals);

    const topicMap = new Map<string, { caseCount: number; sessionCount: number }>();
    const topicClients = new Map<string, Set<string>>();

    caseRecords.forEach(r => {
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

    timeline.forEach(r => {
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

    const topicDistribution = Array.from(topicMap.entries())
      .map(([topic, data]) => ({ topic, ...data }))
      .sort((a, b) => b.caseCount - a.caseCount);

    const sessionTrendData: { date: string; count: number; clientCodes: string[]; topics: string[] }[] = [];
    const sessionByDate = new Map<string, { count: number; clientCodes: Set<string>; topics: Set<string> }>();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toLocalDateString(d);
      sessionByDate.set(dateStr, { count: 0, clientCodes: new Set(), topics: new Set() });
    }

    timeline.forEach(r => {
      if (isWithin30Days(r.sessionDate)) {
        const entry = sessionByDate.get(r.sessionDate);
        if (entry) {
          entry.count++;
          entry.clientCodes.add(r.clientCode);
          if (r.topic) entry.topics.add(r.topic);
        }
      }
    });

    caseRecords.forEach(r => {
      if (isWithin30Days(r.sessionDate)) {
        const entry = sessionByDate.get(r.sessionDate);
        if (entry) {
          entry.count++;
          entry.clientCodes.add(r.clientCode);
          if (r.consultationTopic) entry.topics.add(r.consultationTopic);
        }
      }
    });

    sessionByDate.forEach((value, date) => {
      sessionTrendData.push({
        date,
        count: value.count,
        clientCodes: Array.from(value.clientCodes),
        topics: Array.from(value.topics),
      });
    });
    sessionTrendData.sort((a, b) => a.date.localeCompare(b.date));

    const maxSessionCount = Math.max(...sessionTrendData.map(d => d.count), 1);

    return {
      activeCases: activeCaseSummaries,
      activeCaseCount: activeCaseSummaries.length,
      highRiskCases: highRiskCaseSummaries,
      highRiskCount: highRiskCaseSummaries.length,
      pendingCrisisCount: pendingCrisisSummaries.length,
      pendingCrisis: pendingCrisisSummaries,
      goalCompletion: {
        totalGoals,
        completedGoals,
        activeGoals,
        completionRate: goalCompletionRate,
        avgProgress: avgGoalProgress,
        details: goalCompletionDetails,
      },
      topicDistribution,
      sessionTrend: sessionTrendData,
      maxSessionCount,
      dateRange: {
        start: toLocalDateString(start),
        end: toLocalDateString(end),
      },
    };
  }, [timeline, assessments, goals, caseRecords, crisisWarnings]);

  const handleDrillDown = useCallback((filter: DashboardDrillFilter) => {
    createAuditLog({
      actorRole: role,
      actorName: session?.userName,
      action: "view",
      targetType: "dashboard_drilldown",
      targetId: filter.type,
      targetLabel: filter.value || filter.date || filter.type,
      permissionChecked: "data.overview",
      status: "success",
      details: { filter },
      message: `管理员钻取查看${filter.type}明细`,
    });
    setDrillFilter(filter);
  }, [role, session?.userName]);

  const handleCloseDrillDown = useCallback(() => {
    setDrillFilter(null);
  }, []);

  const renderDrillDownContent = () => {
    if (!drillFilter) return null;

    switch (drillFilter.type) {
      case "activeCases":
        return (
          <DrillDownModal
            title="活跃个案明细"
            subtitle={`近30天内有会谈记录的个案（共 ${dashboardData.activeCaseCount} 个）`}
            onClose={handleCloseDrillDown}
          >
            <div className="drill-table-container">
              <table className="drill-table">
                <thead>
                  <tr>
                    <th>来访者代号</th>
                    <th>咨询主题</th>
                    <th>近30天会谈数</th>
                    <th>最近会谈日期</th>
                    <th>当前风险等级</th>
                    <th>活跃目标数</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.activeCases.map(item => (
                    <tr key={item.clientCode}>
                      <td><strong>{item.clientCode}</strong></td>
                      <td>{item.consultationTopic}</td>
                      <td>{item.sessionCount30Days} 次</td>
                      <td>{item.latestSessionDate}</td>
                      <td>
                        {item.currentRiskLevel ? (
                          <span className={`risk-badge-inline ${riskLevelColors[item.currentRiskLevel]}`}>
                            {riskLevelLabels[item.currentRiskLevel]}
                          </span>
                        ) : "未评估"}
                      </td>
                      <td>{item.activeGoals} 个</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DrillDownModal>
        );

      case "highRisk":
        return (
          <DrillDownModal
            title="高风险关注明细"
            subtitle={`当前风险等级为中风险或高风险的个案（共 ${dashboardData.highRiskCount} 个）`}
            onClose={handleCloseDrillDown}
          >
            <div className="drill-table-container">
              <table className="drill-table">
                <thead>
                  <tr>
                    <th>来访者代号</th>
                    <th>咨询主题</th>
                    <th>风险等级</th>
                    <th>风险评分</th>
                    <th>评估日期</th>
                    <th>是否有活跃预警</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.highRiskCases.map(item => (
                    <tr key={item.clientCode}>
                      <td><strong>{item.clientCode}</strong></td>
                      <td>{item.consultationTopic}</td>
                      <td>
                        <span className={`risk-badge-inline ${riskLevelColors[item.riskLevel]}`}>
                          {riskLevelLabels[item.riskLevel]}
                        </span>
                      </td>
                      <td>{item.riskScore} / 20</td>
                      <td>{item.assessDate}</td>
                      <td>
                        {item.hasActiveWarning ? (
                          <span className="drill-badge danger">有活跃预警</span>
                        ) : (
                          <span className="drill-badge success">无活跃预警</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DrillDownModal>
        );

      case "pendingCrisis":
        return (
          <DrillDownModal
            title="危机预警待处理明细"
            subtitle={`当前待处理的危机预警（共 ${dashboardData.pendingCrisisCount} 条）`}
            onClose={handleCloseDrillDown}
          >
            <div className="drill-table-container">
              <table className="drill-table">
                <thead>
                  <tr>
                    <th>预警编号</th>
                    <th>来访者代号</th>
                    <th>触发类型</th>
                    <th>创建时间</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.pendingCrisis.map(item => (
                    <tr key={item.id}>
                      <td><strong>{item.id.toUpperCase()}</strong></td>
                      <td>{item.clientCode}</td>
                      <td>{item.triggerType}</td>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                      <td>
                        <span className="drill-badge warning">{item.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DrillDownModal>
        );

      case "goalCompletion":
        return (
          <DrillDownModal
            title="目标完成明细"
            subtitle={`按来访者聚合统计（共 ${dashboardData.goalCompletion.details.length} 位来访者）`}
            onClose={handleCloseDrillDown}
          >
            <div className="drill-summary-row">
              <div className="drill-summary-card">
                <span className="drill-summary-label">总目标数</span>
                <strong>{dashboardData.goalCompletion.totalGoals}</strong>
              </div>
              <div className="drill-summary-card">
                <span className="drill-summary-label">已完成</span>
                <strong className="goal-completed-text">{dashboardData.goalCompletion.completedGoals}</strong>
              </div>
              <div className="drill-summary-card">
                <span className="drill-summary-label">进行中</span>
                <strong className="goal-active-text">{dashboardData.goalCompletion.activeGoals}</strong>
              </div>
              <div className="drill-summary-card">
                <span className="drill-summary-label">完成率</span>
                <strong>{dashboardData.goalCompletion.completionRate}%</strong>
              </div>
              <div className="drill-summary-card">
                <span className="drill-summary-label">平均进度</span>
                <strong>{dashboardData.goalCompletion.avgProgress}%</strong>
              </div>
            </div>
            <div className="drill-table-container">
              <table className="drill-table">
                <thead>
                  <tr>
                    <th>来访者代号</th>
                    <th>总目标数</th>
                    <th>已完成</th>
                    <th>进行中</th>
                    <th>平均进度</th>
                    <th>最近行动日期</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.goalCompletion.details.map(item => (
                    <tr key={item.clientCode}>
                      <td><strong>{item.clientCode}</strong></td>
                      <td>{item.totalGoals} 个</td>
                      <td>
                        <span className="drill-badge success">{item.completedGoals} 个</span>
                      </td>
                      <td>
                        <span className="drill-badge info">{item.activeGoals} 个</span>
                      </td>
                      <td>
                        <div className="drill-progress-cell">
                          <div className="drill-progress-bar">
                            <div
                              className="drill-progress-fill"
                              style={{ width: `${item.avgProgress}%` }}
                            />
                          </div>
                          <span>{item.avgProgress}%</span>
                        </div>
                      </td>
                      <td>{item.lastActionDate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DrillDownModal>
        );

      case "topic":
        const topicData = dashboardData.topicDistribution.find(t => t.topic === drillFilter.value);
        return (
          <DrillDownModal
            title={`主题明细 - ${drillFilter.value}`}
            subtitle={topicData ? `共 ${topicData.caseCount} 个个案，${topicData.sessionCount} 次会谈` : ""}
            onClose={handleCloseDrillDown}
          >
            <div className="drill-topic-detail">
              <h4>相关个案列表</h4>
              <div className="drill-topic-clients">
                {topicData ? (
                  Array.from(new Set([
                    ...caseRecords
                      .filter(r => r.consultationTopic === drillFilter.value)
                      .map(r => r.clientCode),
                    ...timeline
                      .filter(r => r.topic === drillFilter.value)
                      .map(r => r.clientCode),
                  ])).sort().map(code => {
                    const risk = latestRiskByClientGetter(code);
                    return (
                      <div key={code} className="drill-topic-client-card">
                        <span className="drill-client-code">{code}</span>
                        {risk && (
                          <span className={`risk-badge-inline small ${riskLevelColors[risk.level]}`}>
                            {riskLevelLabels[risk.level]}
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="tl-empty">暂无数据</p>
                )}
              </div>
            </div>
          </DrillDownModal>
        );

      case "sessionTrend":
        const trendData = dashboardData.sessionTrend.find(d => d.date === drillFilter.date);
        return (
          <DrillDownModal
            title={`会谈明细 - ${drillFilter.date}`}
            subtitle={trendData ? `共 ${trendData.count} 次会谈` : ""}
            onClose={handleCloseDrillDown}
          >
            {trendData && trendData.count > 0 ? (
              <>
                <div className="drill-trend-summary">
                  <div className="drill-summary-card">
                    <span className="drill-summary-label">会谈次数</span>
                    <strong>{trendData.count}</strong>
                  </div>
                  <div className="drill-summary-card">
                    <span className="drill-summary-label">涉及来访者</span>
                    <strong>{trendData.clientCodes.length}</strong>
                  </div>
                  <div className="drill-summary-card">
                    <span className="drill-summary-label">涉及主题</span>
                    <strong>{trendData.topics.length}</strong>
                  </div>
                </div>
                <div className="drill-trend-clients">
                  <h4>涉及来访者</h4>
                  <div className="drill-topic-clients">
                    {trendData.clientCodes.sort().map(code => {
                      const risk = latestRiskByClientGetter(code);
                      return (
                        <div key={code} className="drill-topic-client-card">
                          <span className="drill-client-code">{code}</span>
                          {risk && (
                            <span className={`risk-badge-inline small ${riskLevelColors[risk.level]}`}>
                              {riskLevelLabels[risk.level]}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {trendData.topics.length > 0 && (
                  <div className="drill-trend-topics">
                    <h4>涉及主题</h4>
                    <div className="drill-topic-tags">
                      {trendData.topics.map(topic => (
                        <span key={topic} className="drill-topic-tag">{topic}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="tl-empty">当日无会谈记录</p>
            )}
          </DrillDownModal>
        );

      default:
        return null;
    }
  };

  const latestRiskByClientGetter = useCallback((code: string) => {
    return assessments
      .filter(a => a.clientCode === code)
      .sort(compareRiskTime)[0] || null;
  }, [assessments]);

  return (
    <section className="records panel admin-dashboard">
      <div className="section-heading">
        <div>
          <p>机构管理</p>
          <h2>运营看板</h2>
          <p className="section-subtitle">
            基于近30天数据实时计算 · 点击指标可查看聚合明细 · 不展示原始咨询内容
          </p>
        </div>
        <div className="dashboard-date-range">
          数据范围：{dashboardData.dateRange.start} 至 {dashboardData.dateRange.end}
        </div>
      </div>

      <div className="dashboard-metrics">
        <MetricCard
          label="活跃个案数"
          value={dashboardData.activeCaseCount}
          icon="📊"
          colorClass="metric-active"
          description="近30天有会谈记录"
          onClick={() => handleDrillDown({ type: "activeCases" })}
        />
        <MetricCard
          label="高风险关注数"
          value={dashboardData.highRiskCount}
          icon="⚠️"
          colorClass="metric-high-risk"
          description="中风险+高风险"
          onClick={() => handleDrillDown({ type: "highRisk" })}
        />
        <MetricCard
          label="危机预警待处理"
          value={dashboardData.pendingCrisisCount}
          icon="🚨"
          colorClass="metric-crisis"
          description="需要及时处理"
          onClick={() => handleDrillDown({ type: "pendingCrisis" })}
        />
        <MetricCard
          label="目标完成率"
          value={`${dashboardData.goalCompletion.completionRate}%`}
          icon="🎯"
          colorClass="metric-goal"
          description={`平均进度 ${dashboardData.goalCompletion.avgProgress}%`}
          onClick={() => handleDrillDown({ type: "goalCompletion" })}
        />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h3 className="dashboard-panel-title">咨询主题分布</h3>
            <span className="dashboard-panel-subtitle">
              共 {dashboardData.topicDistribution.length} 个主题
            </span>
          </div>
          {dashboardData.topicDistribution.length === 0 ? (
            <p className="tl-empty">暂无数据</p>
          ) : (
            <div className="topic-distribution-list">
              {dashboardData.topicDistribution.map(item => (
                <div
                  key={item.topic}
                  className="topic-dist-item clickable"
                  onClick={() => handleDrillDown({ type: "topic", value: item.topic })}
                >
                  <div className="topic-dist-header">
                    <span className="topic-dist-name">{item.topic}</span>
                    <span className="topic-dist-count">{item.caseCount} 个个案</span>
                  </div>
                  <div className="topic-dist-bar">
                    <div
                      className="topic-dist-fill"
                      style={{
                        width: `${dashboardData.activeCaseCount > 0 ? (item.caseCount / dashboardData.activeCaseCount) * 100 : 0}%`
                      }}
                    />
                  </div>
                  <div className="topic-dist-meta">
                    <span>{item.sessionCount} 次会谈</span>
                    <span className="drill-hint">点击查看明细 →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h3 className="dashboard-panel-title">近30天会谈趋势</h3>
            <span className="dashboard-panel-subtitle">
              总计 {dashboardData.sessionTrend.reduce((s, d) => s + d.count, 0)} 次会谈
            </span>
          </div>
          <div className="session-trend-chart">
            <div className="session-trend-bars">
              {dashboardData.sessionTrend.map(item => (
                <div
                  key={item.date}
                  className="session-trend-bar-wrapper"
                  onClick={() => item.count > 0 && handleDrillDown({ type: "sessionTrend", date: item.date })}
                >
                  <div
                    className={`session-trend-bar ${item.count > 0 ? "clickable" : ""}`}
                    style={{
                      height: `${(item.count / dashboardData.maxSessionCount) * 100}%`,
                    }}
                    title={`${item.date}: ${item.count} 次会谈`}
                  >
                    {item.count > 0 && (
                      <span className="session-trend-count">{item.count}</span>
                    )}
                  </div>
                  <span className="session-trend-date">
                    {item.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
            <div className="session-trend-legend">
              <span>点击柱状图查看当日明细</span>
            </div>
          </div>
        </div>
      </div>

      {renderDrillDownContent()}
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon,
  colorClass,
  description,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: string;
  colorClass: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <article
      className={`dashboard-metric-card ${colorClass} clickable`}
      onClick={onClick}
    >
      <div className="dashboard-metric-icon">{icon}</div>
      <div className="dashboard-metric-content">
        <span className="dashboard-metric-label">{label}</span>
        <strong className="dashboard-metric-value">{value}</strong>
        <span className="dashboard-metric-desc">{description}</span>
      </div>
      <span className="dashboard-metric-arrow">→</span>
    </article>
  );
}

function DrillDownModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide drill-modal" onClick={e => e.stopPropagation()}>
        <div className="drill-modal-header">
          <div>
            <h3 className="modal-title">{title}</h3>
            {subtitle && <p className="modal-desc">{subtitle}</p>}
          </div>
          <button className="drill-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="drill-modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
