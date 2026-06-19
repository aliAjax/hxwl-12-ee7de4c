import type {
  TimelineRecord,
  RiskAssessment,
  InterventionGoal,
  CaseRecord,
  RiskLevel,
  GoalStatus,
} from "../App";
import { desensitizeText, getMaskedItemLabel, type MaskedItemInfo } from "./desensitize";
import type { UserRole } from "../auth/roleConfig";
import type { AuditLog } from "../auth/auditLog";

export interface SummaryInput {
  clientCode: string;
  startDate: string;
  endDate: string;
  timeline: TimelineRecord[];
  assessments: RiskAssessment[];
  goals: InterventionGoal[];
  caseRecords: CaseRecord[];
}

export interface SummarySection {
  title: string;
  content: string;
}

export interface GeneratedSummary {
  basicTopics: SummarySection;
  riskChanges: SummarySection;
  keyInterventions: SummarySection;
  goalProgress: SummarySection;
  nextPlan: SummarySection;
  meta: {
    clientCode: string;
    startDate: string;
    endDate: string;
    sessionCount: number;
    generationDate: string;
  };
  allMaskedItems: MaskedItemInfo[];
}

const riskLevelLabels: Record<RiskLevel, string> = {
  stable: "稳定",
  watch: "关注",
  medium: "中风险",
  high: "高风险",
};

const goalStatusLabels: Record<GoalStatus, string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
};

function isDateInRange(dateStr: string, start: string, end: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (start && d < new Date(start)) return false;
  if (end) {
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    if (d > endDate) return false;
  }
  return true;
}

function desensitizeSection(content: string): { content: string; maskedItems: MaskedItemInfo[] } {
  const result = desensitizeText(content);
  return {
    content: result.text,
    maskedItems: result.maskedItems,
  };
}

export function generateSummary(input: SummaryInput): GeneratedSummary {
  const { clientCode, startDate, endDate, timeline, assessments, goals, caseRecords } = input;

  const filteredTimeline = timeline.filter(
    (r) => r.clientCode === clientCode && isDateInRange(r.sessionDate, startDate, endDate)
  ).sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  const filteredAssessments = assessments.filter(
    (a) => a.clientCode === clientCode && isDateInRange(a.assessDate, startDate, endDate)
  ).sort((a, b) => a.assessDate.localeCompare(b.assessDate));

  const filteredGoals = goals.filter(
    (g) => g.clientCode === clientCode
  ).filter((g) => {
    if (startDate || endDate) {
      return isDateInRange(g.createdAt, startDate, endDate) ||
        isDateInRange(g.lastActionDate, startDate, endDate) ||
        g.status === "active";
    }
    return true;
  });

  const filteredCaseRecords = caseRecords.filter(
    (r) => r.clientCode === clientCode && isDateInRange(r.sessionDate, startDate, endDate)
  ).sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  const allMaskedItems: MaskedItemInfo[] = [];
  const addMaskedItems = (items: MaskedItemInfo[]) => {
    items.forEach((item) => {
      const exists = allMaskedItems.some(
        (m) => m.type === item.type && m.masked === item.masked
      );
      if (!exists) {
        allMaskedItems.push(item);
      }
    });
  };

  // 基本主题
  const topicsSet = new Set<string>();
  filteredTimeline.forEach(r => r.topic && topicsSet.add(r.topic));
  filteredCaseRecords.forEach(r => r.consultationTopic && topicsSet.add(r.consultationTopic));
  const concerns: string[] = [];
  filteredCaseRecords.forEach(r => {
    if (r.mainConcern) concerns.push(`[${r.sessionDate}] ${r.mainConcern}`);
  });

  let basicTopicsContent = "";
  if (topicsSet.size > 0) {
    basicTopicsContent += `咨询主题：${Array.from(topicsSet).join("、")}\n`;
  }
  if (concerns.length > 0) {
    basicTopicsContent += `\n主要困扰记录：\n${concerns.join("\n")}`;
  }
  if (!basicTopicsContent) {
    basicTopicsContent = "该时间段内无咨询主题记录。";
  }
  const basicTopicsResult = desensitizeSection(basicTopicsContent);
  addMaskedItems(basicTopicsResult.maskedItems);

  // 风险变化
  let riskContent = "";
  if (filteredAssessments.length > 0) {
    riskContent += `风险评估次数：${filteredAssessments.length} 次\n\n`;
    filteredAssessments.forEach((a, idx) => {
      riskContent += `${idx + 1}. [${a.assessDate}] 综合评分 ${a.totalScore} 分（${riskLevelLabels[a.level]}）\n`;
      riskContent += `   维度：睡眠${a.dimensions.sleep}/情绪${a.dimensions.emotion}/自伤${a.dimensions.selfHarm}/支持${a.dimensions.support}/压力${a.dimensions.stress}\n`;
      if (a.summary) {
        riskContent += `   摘要：${a.summary}\n`;
      }
      riskContent += "\n";
    });

    if (filteredAssessments.length >= 2) {
      const first = filteredAssessments[0];
      const last = filteredAssessments[filteredAssessments.length - 1];
      const scoreDiff = last.totalScore - first.totalScore;
      const trend = scoreDiff < 0 ? "下降" : scoreDiff > 0 ? "上升" : "持平";
      riskContent += `风险趋势：首评${first.totalScore}分 → 末评${last.totalScore}分，整体${trend}`;
      if (first.level !== last.level) {
        riskContent += `（${riskLevelLabels[first.level]} → ${riskLevelLabels[last.level]}）`;
      }
      riskContent += "\n";
    }
  } else {
    riskContent = "该时间段内无风险评估记录。\n\n建议：如有需要，请在下次咨询时进行五维风险筛查。";
  }
  const riskResult = desensitizeSection(riskContent);
  addMaskedItems(riskResult.maskedItems);

  // 关键干预
  let interventionContent = "";
  const interventions: { date: string; method: string; emotion: string }[] = [];
  filteredTimeline.forEach(r => {
    if (r.intervention) {
      interventions.push({ date: r.sessionDate, method: r.intervention, emotion: r.emotionalState });
    }
  });
  filteredCaseRecords.forEach(r => {
    if (r.intervention) {
      interventions.push({ date: r.sessionDate, method: r.intervention, emotion: r.emotionalState });
    }
  });
  interventions.sort((a, b) => a.date.localeCompare(b.date));

  if (interventions.length > 0) {
    interventionContent += `干预记录次数：${interventions.length} 次\n\n`;
    interventions.forEach((item, idx) => {
      interventionContent += `${idx + 1}. [${item.date}] 情绪：${item.emotion || "—"}\n`;
      interventionContent += `   干预方法：${item.method}\n\n`;
    });

    const methodSet = new Set<string>();
    interventions.forEach(i => {
      const parts = i.method.split(/[+、,，\s]+/).filter(p => p.trim().length > 0);
      parts.forEach(p => methodSet.add(p.trim()));
    });
    if (methodSet.size > 0) {
      interventionContent += `使用技术汇总：${Array.from(methodSet).join("、")}\n`;
    }
  } else {
    interventionContent = "该时间段内无干预方法记录。";
  }
  const interventionResult = desensitizeSection(interventionContent);
  addMaskedItems(interventionResult.maskedItems);

  // 目标进展
  let goalContent = "";
  if (filteredGoals.length > 0) {
    const activeCount = filteredGoals.filter(g => g.status === "active").length;
    const completedCount = filteredGoals.filter(g => g.status === "completed").length;
    const pausedCount = filteredGoals.filter(g => g.status === "paused").length;
    goalContent += `目标总数：${filteredGoals.length} 个（进行中${activeCount} / 已完成${completedCount} / 已暂停${pausedCount}）\n\n`;

    filteredGoals.forEach((g, idx) => {
      const progress = g.totalSteps > 0 ? Math.round((g.completedSteps / g.totalSteps) * 100) : 0;
      goalContent += `${idx + 1}. 目标名称：${g.goalTitle}\n`;
      goalContent += `   状态：${goalStatusLabels[g.status]} · 进度 ${g.completedSteps}/${g.totalSteps}（${progress}%）\n`;
      if (g.description) {
        goalContent += `   描述：${g.description}\n`;
      }
      if (g.lastAction) {
        goalContent += `   最近行动：${g.lastAction}（${g.lastActionDate || "日期未记录"}）\n`;
      }
      if (g.nextPractice && g.status === "active") {
        goalContent += `   下次练习：${g.nextPractice}（${g.nextPracticeDate || "日期未安排"}）\n`;
      }
      goalContent += "\n";
    });

    const totalSteps = filteredGoals.reduce((s, g) => s + g.totalSteps, 0);
    const completedSteps = filteredGoals.reduce((s, g) => s + g.completedSteps, 0);
    const overallProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    goalContent += `\n总体进度：${completedSteps}/${totalSteps} 步骤完成，综合进度 ${overallProgress}%`;
  } else {
    goalContent = "该来访者暂无干预目标记录。\n\n建议：如咨询已进入稳定阶段，可考虑共同设定阶段目标。";
  }
  const goalResult = desensitizeSection(goalContent);
  addMaskedItems(goalResult.maskedItems);

  // 下次计划
  let nextPlanContent = "";
  const nextPlans: { date: string; plan: string }[] = [];
  filteredTimeline.forEach(r => {
    if (r.nextGoal) nextPlans.push({ date: r.sessionDate, plan: r.nextGoal });
  });
  filteredCaseRecords.forEach(r => {
    if (r.nextGoal) nextPlans.push({ date: r.sessionDate, plan: r.nextGoal });
  });
  nextPlans.sort((a, b) => b.date.localeCompare(a.date));

  if (nextPlans.length > 0) {
    const latest = nextPlans[0];
    nextPlanContent += `近期计划（${latest.date} 记录）：\n${latest.plan}\n`;

    if (filteredGoals.some(g => g.status === "active" && g.nextPractice)) {
      nextPlanContent += "\n待完成练习：\n";
      filteredGoals
        .filter(g => g.status === "active" && g.nextPractice)
        .forEach((g, idx) => {
          nextPlanContent += `${idx + 1}. [${g.goalTitle}] ${g.nextPractice}`;
          if (g.nextPracticeDate) {
            nextPlanContent += `（截止：${g.nextPracticeDate}）`;
          }
          nextPlanContent += "\n";
        });
    }

    if (nextPlans.length > 1) {
      nextPlanContent += "\n历史计划回顾：\n";
      nextPlans.slice(1).forEach((item, idx) => {
        nextPlanContent += `${idx + 1}. [${item.date}] ${item.plan}\n`;
      });
    }
  } else {
    nextPlanContent = "暂无明确的后续计划记录。\n\n建议：\n1. 在下次咨询中共同确认阶段目标\n2. 根据风险等级确定跟进频率\n3. 如有自伤风险，请制定书面安全计划";
  }
  const nextPlanResult = desensitizeSection(nextPlanContent);
  addMaskedItems(nextPlanResult.maskedItems);

  return {
    basicTopics: { title: "一、基本主题", content: basicTopicsResult.content },
    riskChanges: { title: "二、风险变化", content: riskResult.content },
    keyInterventions: { title: "三、关键干预", content: interventionResult.content },
    goalProgress: { title: "四、目标进展", content: goalResult.content },
    nextPlan: { title: "五、下次计划", content: nextPlanResult.content },
    meta: {
      clientCode,
      startDate,
      endDate,
      sessionCount: filteredTimeline.length + filteredCaseRecords.length,
      generationDate: new Date().toISOString().slice(0, 10),
    },
    allMaskedItems,
  };
}

export function summaryToText(summary: GeneratedSummary): string {
  const { meta, basicTopics, riskChanges, keyInterventions, goalProgress, nextPlan } = summary;
  const dateRange = meta.startDate && meta.endDate
    ? `${meta.startDate} 至 ${meta.endDate}`
    : meta.startDate
      ? `${meta.startDate} 至今`
      : meta.endDate
        ? `截至 ${meta.endDate}`
        : "全部记录";

  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                  心理咨询会谈摘要报告");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`来访者代号：${meta.clientCode}`);
  lines.push(`时间范围：${dateRange}`);
  lines.push(`会谈次数：${meta.sessionCount} 次`);
  lines.push(`生成日期：${meta.generationDate}`);
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");

  const sections = [basicTopics, riskChanges, keyInterventions, goalProgress, nextPlan];
  sections.forEach((section, idx) => {
    lines.push(section.title);
    lines.push("");
    lines.push(section.content);
    if (idx < sections.length - 1) {
      lines.push("");
      lines.push("───────────────────────────────────────────────────────────");
      lines.push("");
    }
  });

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                      报告结束");
  lines.push("═══════════════════════════════════════════════════════════");

  return lines.join("\n");
}

export async function copySummaryToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch (e) {
    console.error("复制失败:", e);
    return false;
  }
}

export interface ExportOptions {
  scopeKey: string;
  scopeLabel: string;
  includes: string[];
  desensitized: boolean;
  operatorRole: UserRole;
  operatorName?: string;
  targetClientCode?: string;
  dateRange?: { start?: string; end?: string };
}

export interface ExportResult {
  title: string;
  content: string;
  summary?: GeneratedSummary;
  meta: {
    scopeKey: string;
    scopeLabel: string;
    desensitized: boolean;
    includes: string[];
    recordCount: number;
    generationDate: string;
    operatorRole: UserRole;
    operatorName?: string;
    targetClientCode?: string;
    dateRange?: { start?: string; end?: string };
  };
  allMaskedItems: MaskedItemInfo[];
}

function filterSummaryByIncludes(
  summary: GeneratedSummary,
  includes: string[]
): { sections: SummarySection[]; maskedItems: MaskedItemInfo[] } {
  const sectionMap: Record<string, SummarySection> = {
    "基本主题": summary.basicTopics,
    "风险变化": summary.riskChanges,
    "关键干预": summary.keyInterventions,
    "目标进展": summary.goalProgress,
    "下次计划": summary.nextPlan,
  };

  const sections: SummarySection[] = [];
  includes.forEach((include) => {
    if (sectionMap[include]) {
      sections.push(sectionMap[include]);
    }
  });

  return {
    sections,
    maskedItems: summary.allMaskedItems,
  };
}

function generateAggregateReport(
  timeline: TimelineRecord[],
  assessments: RiskAssessment[],
  goals: InterventionGoal[],
  caseRecords: CaseRecord[],
  desensitized: boolean
): { content: string; maskedItems: MaskedItemInfo[] } {
  const allMaskedItems: MaskedItemInfo[] = [];
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                心理咨询机构汇总报表");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`生成日期：${new Date().toLocaleString("zh-CN")}`);
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");

  lines.push("一、个案数量统计");
  lines.push("");
  const uniqueClientCodes = Array.from(
    new Set([
      ...timeline.map((r) => r.clientCode),
      ...assessments.map((r) => r.clientCode),
      ...goals.map((r) => r.clientCode),
      ...caseRecords.map((r) => r.clientCode),
    ])
  ).sort();
  lines.push(`活跃来访者总数：${uniqueClientCodes.length} 人`);
  lines.push(`时间线记录总数：${timeline.length} 条`);
  lines.push(`风险评估总数：${assessments.length} 次`);
  lines.push(`干预目标总数：${goals.length} 个`);
  lines.push(`个案记录总数：${caseRecords.length} 份`);
  lines.push("");

  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");
  lines.push("二、风险等级分布");
  lines.push("");
  const riskCountByLevel: Record<RiskLevel, number> = {
    stable: 0,
    watch: 0,
    medium: 0,
    high: 0,
  };
  const latestRiskByClient = new Map<string, RiskAssessment>();
  for (const a of assessments) {
    const existing = latestRiskByClient.get(a.clientCode);
    if (!existing || existing.assessDate < a.assessDate) {
      latestRiskByClient.set(a.clientCode, a);
    }
  }
  for (const a of latestRiskByClient.values()) {
    riskCountByLevel[a.level]++;
  }
  const riskTotal = Object.values(riskCountByLevel).reduce((s, n) => s + n, 0);
  Object.entries(riskCountByLevel).forEach(([level, count]) => {
    const label = riskLevelLabels[level as RiskLevel];
    const percent = riskTotal > 0 ? Math.round((count / riskTotal) * 100) : 0;
    lines.push(`  ${label}：${count} 人（${percent}%）`);
  });
  lines.push("");

  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");
  lines.push("三、咨询主题分布");
  lines.push("");
  const topicCount = new Map<string, number>();
  caseRecords.forEach((r) => {
    if (r.consultationTopic) {
      topicCount.set(r.consultationTopic, (topicCount.get(r.consultationTopic) || 0) + 1);
    }
  });
  timeline.forEach((r) => {
    if (r.topic) {
      topicCount.set(r.topic, (topicCount.get(r.topic) || 0) + 1);
    }
  });
  const sortedTopics = Array.from(topicCount.entries()).sort((a, b) => b[1] - a[1]);
  const topicTotal = sortedTopics.reduce((s, [, c]) => s + c, 0);
  if (sortedTopics.length > 0) {
    sortedTopics.slice(0, 10).forEach(([topic, count], idx) => {
      const percent = topicTotal > 0 ? Math.round((count / topicTotal) * 100) : 0;
      lines.push(`  ${idx + 1}. ${topic}：${count} 次（${percent}%）`);
    });
  } else {
    lines.push("  暂无咨询主题记录");
  }
  lines.push("");

  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");
  lines.push("四、目标完成率");
  lines.push("");
  const statusCount: Record<GoalStatus, number> = {
    active: 0,
    paused: 0,
    completed: 0,
  };
  goals.forEach((g) => {
    statusCount[g.status]++;
  });
  const totalSteps = goals.reduce((s, g) => s + g.totalSteps, 0);
  const completedSteps = goals.reduce((s, g) => s + g.completedSteps, 0);
  const overallProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  lines.push(`目标总数：${goals.length} 个`);
  lines.push(`  进行中：${statusCount.active} 个`);
  lines.push(`  已暂停：${statusCount.paused} 个`);
  lines.push(`  已完成：${statusCount.completed} 个`);
  const completionRate = goals.length > 0 ? Math.round((statusCount.completed / goals.length) * 100) : 0;
  lines.push(`目标完成率：${completionRate}%`);
  lines.push(`综合进度：${overallProgress}%（${completedSteps}/${totalSteps} 步骤）`);
  lines.push("");

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                    报告结束");
  lines.push("═══════════════════════════════════════════════════════════");

  let result = lines.join("\n");

  if (desensitized) {
    const desensitized = desensitizeText(result);
    result = desensitized.text;
    desensitized.maskedItems.forEach((item) => {
      const exists = allMaskedItems.some(
        (m) => m.type === item.type && m.masked === item.masked
      );
      if (!exists) allMaskedItems.push(item);
    });
  }

  return { content: result, maskedItems: allMaskedItems };
}

function generateFullDataExport(
  timeline: TimelineRecord[],
  assessments: RiskAssessment[],
  goals: InterventionGoal[],
  caseRecords: CaseRecord[],
  auditLogs: AuditLog[],
  desensitized: boolean,
  targetClientCode?: string
): { content: string; maskedItems: MaskedItemInfo[] } {
  const allMaskedItems: MaskedItemInfo[] = [];
  const lines: string[] = [];

  const scopeLabel = targetClientCode
    ? `【${targetClientCode}】完整数据导出`
    : "全量完整数据导出";

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                " + scopeLabel);
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`生成日期：${new Date().toLocaleString("zh-CN")}`);
  lines.push(`数据范围：${targetClientCode ? "单个来访者" : "全部来访者"}`);
  lines.push(`脱敏模式：${desensitized ? "已启用" : "未启用"}`);
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");

  const filterFn = targetClientCode
    ? (r: { clientCode: string }) => r.clientCode === targetClientCode
    : () => true;

  const filteredTimeline = timeline.filter(filterFn);
  const filteredAssessments = assessments.filter(filterFn);
  const filteredGoals = goals.filter(filterFn);
  const filteredCaseRecords = caseRecords.filter(filterFn);

  lines.push("一、全部会谈记录（时间线+个案档案）");
  lines.push("");
  const allRecords = [
    ...filteredTimeline.map((r) => ({
      date: r.sessionDate,
      type: "时间线",
      topic: r.topic || r.eventType || "未分类",
      content: `情绪：${r.emotionalState || "—"} | 干预：${r.intervention || "—"} | 备注：${r.notes || "—"}`,
    })),
    ...filteredCaseRecords.map((r) => ({
      date: r.sessionDate,
      type: "个案档案",
      topic: r.consultationTopic,
      content: `情绪：${r.emotionalState} | 困扰：${r.mainConcern} | 干预：${r.intervention} | 下次：${r.nextGoal || "—"}`,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  allRecords.forEach((r, idx) => {
    lines.push(`${idx + 1}. [${r.date}] ${r.type} - ${r.topic}`);
    lines.push(`   ${r.content}`);
    lines.push("");
  });
  if (allRecords.length === 0) lines.push("  暂无记录");
  lines.push("");

  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");
  lines.push("二、完整风险评估");
  lines.push("");
  filteredAssessments
    .sort((a, b) => a.assessDate.localeCompare(b.assessDate))
    .forEach((a, idx) => {
      lines.push(`${idx + 1}. [${a.assessDate}] ${a.clientCode}`);
      lines.push(`   综合评分：${a.totalScore} 分（${riskLevelLabels[a.level]}）`);
      lines.push(`   维度得分：睡眠${a.dimensions.sleep}/情绪${a.dimensions.emotion}/自伤${a.dimensions.selfHarm}/支持${a.dimensions.support}/压力${a.dimensions.stress}`);
      if (a.summary) lines.push(`   评估摘要：${a.summary}`);
      if (a.notes) lines.push(`   备注：${a.notes}`);
      lines.push("");
    });
  if (filteredAssessments.length === 0) lines.push("  暂无风险评估记录");
  lines.push("");

  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");
  lines.push("三、干预目标详情");
  lines.push("");
  filteredGoals
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((g, idx) => {
      const progress = g.totalSteps > 0 ? Math.round((g.completedSteps / g.totalSteps) * 100) : 0;
      lines.push(`${idx + 1}. 目标：${g.goalTitle}`);
      lines.push(`   状态：${goalStatusLabels[g.status]} | 进度：${progress}%（${g.completedSteps}/${g.totalSteps}）`);
      if (g.description) lines.push(`   描述：${g.description}`);
      if (g.lastAction) lines.push(`   最近行动：${g.lastAction}（${g.lastActionDate || "日期未记"}）`);
      if (g.nextPractice && g.status === "active")
        lines.push(`   下次练习：${g.nextPractice}（${g.nextPracticeDate || "日期未安排"}）`);
      lines.push("");
    });
  if (filteredGoals.length === 0) lines.push("  暂无干预目标记录");
  lines.push("");

  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");
  lines.push("四、审计日志记录（操作行为追踪）");
  lines.push("");
  const filteredAuditLogs = auditLogs
    .filter((log) => !targetClientCode || log.targetLabel === targetClientCode)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 200);

  filteredAuditLogs.forEach((log, idx) => {
    const actionLabels: Record<string, string> = {
      create: "创建",
      update: "更新",
      delete: "删除",
      export: "导出",
      feedback: "督导反馈",
      submit: "提交",
      login: "登录",
      role_change: "角色切换",
      system_reset: "系统重置",
      view: "查看",
    };
    const targetLabels: Record<string, string> = {
      case_record: "个案记录",
      timeline_record: "时间线",
      risk_assessment: "风险评估",
      intervention_goal: "干预目标",
      supervision_record: "督导申请",
      supervision_feedback: "督导反馈",
      user_session: "用户会话",
      system: "系统",
      audit_log: "审计日志",
      export_report: "导出报告",
    };
    const statusLabels: Record<string, string> = {
      success: "成功",
      denied: "拒绝",
      failed: "失败",
      pending: "待处理",
    };
    lines.push(
      `${idx + 1}. [${new Date(log.timestamp).toLocaleString("zh-CN")}] ` +
        `${actionLabels[log.action] || log.action} ` +
        `${targetLabels[log.targetType] || log.targetType} ` +
        `[${log.targetLabel || log.targetId || ""}] ` +
        `(${log.actorName} / ${log.actorRole}) ` +
        `→ ${statusLabels[log.status] || log.status}`
    );
    if (log.message) lines.push(`   ${log.message}`);
  });
  if (filteredAuditLogs.length === 0) lines.push("  暂无审计日志记录");
  lines.push("");

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                    报告结束");
  lines.push("═══════════════════════════════════════════════════════════");

  let result = lines.join("\n");

  if (desensitized) {
    const desensitized = desensitizeText(result);
    result = desensitized.text;
    desensitized.maskedItems.forEach((item) => {
      const exists = allMaskedItems.some(
        (m) => m.type === item.type && m.masked === item.masked
      );
      if (!exists) allMaskedItems.push(item);
    });
  }

  return { content: result, maskedItems: allMaskedItems };
}

export function generateExportByScope(
  options: ExportOptions,
  summaryData: {
    clientCode?: string;
    startDate?: string;
    endDate?: string;
    timeline: TimelineRecord[];
    assessments: RiskAssessment[];
    goals: InterventionGoal[];
    caseRecords: CaseRecord[];
    auditLogs?: AuditLog[];
  }
): ExportResult {
  const { scopeKey, scopeLabel, includes, desensitized, operatorRole, operatorName, targetClientCode, dateRange } = options;
  const { clientCode, startDate, endDate, timeline, assessments, goals, caseRecords, auditLogs = [] } = summaryData;

  const generationDate = new Date().toLocaleString("zh-CN");

  if (scopeKey === "admin_aggregate") {
    const { content, maskedItems } = generateAggregateReport(timeline, assessments, goals, caseRecords, desensitized);
    return {
      title: "机构汇总报表",
      content,
      meta: {
        scopeKey,
        scopeLabel,
        desensitized,
        includes,
        recordCount: caseRecords.length + timeline.length + assessments.length + goals.length,
        generationDate,
        operatorRole,
        operatorName,
      },
      allMaskedItems: maskedItems,
    };
  }

  if (scopeKey === "admin_full" || scopeKey === "supervisor_full") {
    const { content, maskedItems } = generateFullDataExport(
      timeline,
      assessments,
      goals,
      caseRecords,
      auditLogs,
      desensitized,
      targetClientCode || clientCode
    );
    return {
      title: scopeLabel,
      content,
      meta: {
        scopeKey,
        scopeLabel,
        desensitized,
        includes,
        recordCount: caseRecords.length + timeline.length + assessments.length + goals.length + auditLogs.length,
        generationDate,
        operatorRole,
        operatorName,
        targetClientCode: targetClientCode || clientCode,
        dateRange,
      },
      allMaskedItems: maskedItems,
    };
  }

  const summary = generateSummary({
    clientCode: clientCode || targetClientCode || "",
    startDate: startDate || dateRange?.start || "",
    endDate: endDate || dateRange?.end || "",
    timeline,
    assessments,
    goals,
    caseRecords,
  });

  const { sections, maskedItems } = filterSummaryByIncludes(summary, includes);

  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                " + scopeLabel);
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`来访者代号：${summary.meta.clientCode}`);
  const dateRangeStr = summary.meta.startDate && summary.meta.endDate
    ? `${summary.meta.startDate} 至 ${summary.meta.endDate}`
    : summary.meta.startDate
      ? `${summary.meta.startDate} 至今`
      : summary.meta.endDate
        ? `截至 ${summary.meta.endDate}`
        : "全部记录";
  lines.push(`时间范围：${dateRangeStr}`);
  lines.push(`会谈次数：${summary.meta.sessionCount} 次`);
  lines.push(`生成日期：${generationDate}`);
  lines.push(`操作角色：${operatorName}（${operatorRole}）`);
  lines.push(`脱敏模式：${desensitized ? "已启用" : "未启用"}`);
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────");
  lines.push("");

  sections.forEach((section, idx) => {
    lines.push(section.title);
    lines.push("");
    lines.push(section.content);
    if (idx < sections.length - 1) {
      lines.push("");
      lines.push("───────────────────────────────────────────────────────────");
      lines.push("");
    }
  });

  if (maskedItems.length > 0) {
    lines.push("");
    lines.push("───────────────────────────────────────────────────────────");
    lines.push("");
    lines.push(`🔒 已脱敏 ${maskedItems.length} 项敏感信息：`);
    maskedItems.forEach((item) => {
      lines.push(`  - ${getMaskedItemLabel(item)}`);
    });
  }

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                    报告结束");
  lines.push("═══════════════════════════════════════════════════════════");

  let finalContent = lines.join("\n");
  let finalMaskedItems = [...maskedItems];

  if (desensitized) {
    const desensitizedResult = desensitizeText(finalContent);
    finalContent = desensitizedResult.text;
    desensitizedResult.maskedItems.forEach((item) => {
      const exists = finalMaskedItems.some(
        (m) => m.type === item.type && m.masked === item.masked
      );
      if (!exists) finalMaskedItems.push(item);
    });
  }

  return {
    title: scopeLabel,
    content: finalContent,
    summary,
    meta: {
      scopeKey,
      scopeLabel,
      desensitized,
      includes,
      recordCount: summary.meta.sessionCount,
      generationDate,
      operatorRole,
      operatorName,
      targetClientCode: clientCode || targetClientCode,
      dateRange: { start: startDate || dateRange?.start, end: endDate || dateRange?.end },
    },
    allMaskedItems: finalMaskedItems,
  };
}
