import { describe, it, expect } from "vitest";
import {
  generateSummary,
  summaryToText,
  generateSupervisionDraft,
  generateExportByScope,
  type SummaryInput,
  type SupervisionDraftInput,
} from "../src/utils/summaryGenerator";
import {
  sampleCaseRecord,
  sampleTimelineRecord,
  sampleRiskAssessment,
  sampleInterventionGoal,
} from "./testHelpers";

function buildSummaryInput(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    clientCode: "C-001",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    timeline: [sampleTimelineRecord],
    assessments: [sampleRiskAssessment],
    goals: [sampleInterventionGoal],
    caseRecords: [sampleCaseRecord],
    ...overrides,
  };
}

describe("generateSummary 基本主题提取", () => {
  it("应正确提取咨询主题集合", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.basicTopics.content).toContain("咨询主题");
    expect(summary.basicTopics.content).toContain("焦虑障碍");
  });

  it("应提取个案记录中的主要困扰", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.basicTopics.content).toContain("主要困扰记录");
    expect(summary.basicTopics.content).toContain("工作压力大，经常失眠");
  });

  it("无任何记录时应显示提示文案", () => {
    const input = buildSummaryInput({
      timeline: [],
      caseRecords: [],
      assessments: [],
      goals: [],
    });
    const summary = generateSummary(input);
    expect(summary.basicTopics.content).toContain("无咨询主题记录");
  });

  it("meta 中应包含正确的元数据", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.meta.clientCode).toBe("C-001");
    expect(summary.meta.startDate).toBe("2026-06-01");
    expect(summary.meta.endDate).toBe("2026-06-30");
    expect(summary.meta.sessionCount).toBe(2);
    expect(summary.meta.generationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("generateSummary 风险变化分析", () => {
  it("应正确显示风险评估次数和评分", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.riskChanges.content).toContain("风险评估次数：1 次");
    expect(summary.riskChanges.content).toContain("综合评分 11 分");
    expect(summary.riskChanges.content).toContain("中风险");
  });

  it("应显示五维得分", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.riskChanges.content).toContain("睡眠2");
    expect(summary.riskChanges.content).toContain("情绪3");
    expect(summary.riskChanges.content).toContain("自伤1");
    expect(summary.riskChanges.content).toContain("支持2");
    expect(summary.riskChanges.content).toContain("压力3");
  });

  it("多次评估应计算趋势", () => {
    const first = { ...sampleRiskAssessment, assessDate: "2026-06-01", totalScore: 14, level: "high" as const };
    const last = { ...sampleRiskAssessment, id: "ra_2", assessDate: "2026-06-15", totalScore: 8, level: "watch" as const };
    const input = buildSummaryInput({ assessments: [first, last] });
    const summary = generateSummary(input);
    expect(summary.riskChanges.content).toContain("首评14分");
    expect(summary.riskChanges.content).toContain("末评8分");
    expect(summary.riskChanges.content).toContain("下降");
  });

  it("无评估时应显示建议文案", () => {
    const input = buildSummaryInput({ assessments: [] });
    const summary = generateSummary(input);
    expect(summary.riskChanges.content).toContain("无风险评估记录");
    expect(summary.riskChanges.content).toContain("五维风险筛查");
  });
});

describe("generateSummary 关键干预统计", () => {
  it("应统计干预记录次数", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.keyInterventions.content).toContain("干预记录次数：2 次");
  });

  it("应汇总使用的干预技术", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.keyInterventions.content).toContain("使用技术汇总");
    expect(summary.keyInterventions.content).toContain("认知行为疗法");
    expect(summary.keyInterventions.content).toContain("呼吸放松训练");
  });

  it("无干预记录时应显示提示", () => {
    const input = buildSummaryInput({
      timeline: [{ ...sampleTimelineRecord, intervention: "" }],
      caseRecords: [{ ...sampleCaseRecord, intervention: "" }],
    });
    const summary = generateSummary(input);
    expect(summary.keyInterventions.content).toContain("无干预方法记录");
  });
});

describe("generateSummary 目标进展跟踪", () => {
  it("应显示目标总数和各状态数量", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.goalProgress.content).toContain("目标总数：1 个");
    expect(summary.goalProgress.content).toContain("进行中1");
  });

  it("应计算每个目标的完成进度", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.goalProgress.content).toContain("进度 2/5");
    expect(summary.goalProgress.content).toContain("40%");
  });

  it("应计算总体进度", () => {
    const goal2 = {
      ...sampleInterventionGoal,
      id: "g_2",
      totalSteps: 10,
      completedSteps: 8,
    };
    const input = buildSummaryInput({ goals: [sampleInterventionGoal, goal2] });
    const summary = generateSummary(input);
    expect(summary.goalProgress.content).toContain("10/15 步骤完成");
    expect(summary.goalProgress.content).toContain("综合进度 67%");
  });

  it("活动目标应显示下次练习", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.goalProgress.content).toContain("下次练习：每日放松练习");
  });
});

describe("generateSummary 下次计划生成", () => {
  it("应提取最新的下次计划", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    expect(summary.nextPlan.content).toContain("近期计划");
    expect(summary.nextPlan.content).toContain("学习放松技巧");
  });

  it("无计划时应显示建议文案", () => {
    const input = buildSummaryInput({
      timeline: [{ ...sampleTimelineRecord, nextGoal: "" }],
      caseRecords: [{ ...sampleCaseRecord, nextGoal: "" }],
      goals: [],
    });
    const summary = generateSummary(input);
    expect(summary.nextPlan.content).toContain("暂无");
    expect(summary.nextPlan.content).toContain("后续计划");
    expect(summary.nextPlan.content).toContain("书面安全计划");
  });
});

describe("summaryToText 文本格式化", () => {
  it("应生成完整的文本报告", () => {
    const input = buildSummaryInput();
    const summary = generateSummary(input);
    const text = summaryToText(summary);

    expect(text).toContain("心理咨询会谈摘要报告");
    expect(text).toContain("来访者代号：C-001");
    expect(text).toContain("2026-06-01 至 2026-06-30");
    expect(text).toContain("会谈次数：2 次");
    expect(text).toContain("一、基本主题");
    expect(text).toContain("二、风险变化");
    expect(text).toContain("三、关键干预");
    expect(text).toContain("四、目标进展");
    expect(text).toContain("五、下次计划");
    expect(text).toContain("报告结束");
  });

  it("无时间范围时应显示全部记录", () => {
    const input = buildSummaryInput({ startDate: "", endDate: "" });
    const summary = generateSummary(input);
    const text = summaryToText(summary);
    expect(text).toContain("时间范围：全部记录");
  });
});

describe("generateSupervisionDraft 督导草稿生成", () => {
  function buildSupervisionInput(overrides: Partial<SupervisionDraftInput> = {}): SupervisionDraftInput {
    return {
      clientCode: "C-001",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      timeline: [sampleTimelineRecord],
      assessments: [sampleRiskAssessment],
      goals: [sampleInterventionGoal],
      caseRecords: [sampleCaseRecord],
      ...overrides,
    };
  }

  it("应包含个案概要、风险变化、干预目标三大板块", () => {
    const input = buildSupervisionInput();
    const draft = generateSupervisionDraft(input);

    expect(draft.caseSummary).toContain("咨询主题");
    expect(draft.riskChanges).toContain("风险评估");
    expect(draft.interventionGoals).toContain("目标总数");
  });

  it("应生成建议的督导片段", () => {
    const input = buildSupervisionInput();
    const draft = generateSupervisionDraft(input);

    expect(draft.suggestedClips.length).toBeGreaterThan(0);
    expect(draft.suggestedClips[0].description).toBeTruthy();
    expect(draft.suggestedClips[0].transcript).toBeTruthy();
  });

  it("meta 中应包含各类型记录的数量", () => {
    const input = buildSupervisionInput();
    const draft = generateSupervisionDraft(input);

    expect(draft.meta.clientCode).toBe("C-001");
    expect(draft.meta.sessionCount).toBe(2);
    expect(draft.meta.assessmentCount).toBe(1);
    expect(draft.meta.goalCount).toBe(1);
  });

  it("无评估时应显示风险筛查建议", () => {
    const input = buildSupervisionInput({ assessments: [] });
    const draft = generateSupervisionDraft(input);
    expect(draft.riskChanges).toContain("五维风险筛查");
  });
});

describe("generateExportByScope 导出范围生成", () => {
  const baseExportOptions = {
    scopeKey: "counselor_summary",
    scopeLabel: "咨询摘要",
    includes: ["基本主题", "风险变化", "关键干预", "目标进展", "下次计划"],
    desensitized: true,
    operatorRole: "counselor" as const,
    operatorName: "李咨询师",
  };

  const baseData = {
    clientCode: "C-001",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    timeline: [sampleTimelineRecord],
    assessments: [sampleRiskAssessment],
    goals: [sampleInterventionGoal],
    caseRecords: [sampleCaseRecord],
    auditLogs: [],
  };

  it("admin_aggregate 范围应生成机构汇总报表", () => {
    const result = generateExportByScope(
      { ...baseExportOptions, scopeKey: "admin_aggregate", scopeLabel: "机构汇总报表" },
      { ...baseData }
    );
    expect(result.title).toBe("机构汇总报表");
    expect(result.content).toContain("心理咨询机构汇总报表");
    expect(result.content).toContain("活跃来访者总数");
    expect(result.content).toContain("风险等级分布");
    expect(result.content).toContain("目标完成率");
  });

  it("admin_full 范围应生成完整数据导出", () => {
    const result = generateExportByScope(
      {
        scopeKey: "admin_full",
        scopeLabel: "完整数据导出",
        includes: [],
        desensitized: false,
        operatorRole: "admin",
      },
      { ...baseData }
    );
    expect(result.title).toBe("完整数据导出");
    expect(result.content).toContain("全部会谈记录");
    expect(result.content).toContain("完整风险评估");
    expect(result.content).toContain("干预目标详情");
    expect(result.content).toContain("审计日志记录");
  });

  it("单个来访者范围应只包含该来访者数据", () => {
    const tl1 = sampleTimelineRecord;
    const tl2 = { ...sampleTimelineRecord, id: "tl_2", clientCode: "C-002" };
    const result = generateExportByScope(
      {
        scopeKey: "supervisor_full",
        scopeLabel: "完整督导报告",
        includes: [],
        desensitized: false,
        operatorRole: "supervisor",
        targetClientCode: "C-002",
      },
      { ...baseData, timeline: [tl1, tl2] }
    );
    expect(result.meta.targetClientCode).toBe("C-002");
    expect(result.content).toContain("【C-002】完整数据导出");
  });

  it("summary 范围应仅包含 includes 指定的章节", () => {
    const result = generateExportByScope(
      {
        ...baseExportOptions,
        includes: ["基本主题", "关键干预"],
      },
      { ...baseData }
    );
    expect(result.content).toContain("一、基本主题");
    expect(result.content).toContain("三、关键干预");
    expect(result.content).not.toContain("二、风险变化");
    expect(result.content).not.toContain("四、目标进展");
  });

  it("脱敏模式应对敏感信息进行脱敏处理", () => {
    const caseWithSensitive = {
      ...sampleCaseRecord,
      mainConcern: "来访者张三因工作压力焦虑，电话13812345678",
    };
    const result = generateExportByScope(
      { ...baseExportOptions, desensitized: true },
      { ...baseData, caseRecords: [caseWithSensitive] }
    );
    expect(result.content).not.toContain("张三");
    expect(result.content).not.toContain("13812345678");
    expect(result.allMaskedItems.length).toBeGreaterThan(0);
  });

  it("recordCount 应正确统计记录数量", () => {
    const result = generateExportByScope(
      { ...baseExportOptions },
      { ...baseData }
    );
    expect(result.meta.recordCount).toBe(2);
  });
});
