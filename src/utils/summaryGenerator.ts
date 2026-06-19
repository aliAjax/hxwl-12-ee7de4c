import type {
  TimelineRecord,
  RiskAssessment,
  InterventionGoal,
  CaseRecord,
  RiskLevel,
  GoalStatus,
} from "../App";
import { desensitizeText, type DesensitizeResult } from "./desensitize";

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
  allMaskedItems: string[];
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

function desensitizeSection(content: string): { content: string; maskedItems: string[] } {
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

  const allMaskedItems: string[] = [];

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
  allMaskedItems.push(...basicTopicsResult.maskedItems);

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
  allMaskedItems.push(...riskResult.maskedItems);

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
  allMaskedItems.push(...interventionResult.maskedItems);

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
  allMaskedItems.push(...goalResult.maskedItems);

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
  allMaskedItems.push(...nextPlanResult.maskedItems);

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
    allMaskedItems: Array.from(new Set(allMaskedItems)),
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
