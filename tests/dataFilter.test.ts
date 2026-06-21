import { describe, it, expect } from "vitest";
import {
  filterDataByRole,
  getActiveClientCodes,
  canAccessTab,
} from "../src/auth/dataFilter";
import {
  sampleCaseRecord,
  sampleTimelineRecord,
  sampleRiskAssessment,
  sampleInterventionGoal,
  sampleCrisisWarning,
} from "./testHelpers";
import type { SupervisionRecord } from "../src/App";

function buildFullData() {
  return {
    caseRecords: [
      sampleCaseRecord,
      { ...sampleCaseRecord, id: "cr_2", clientCode: "C-002" },
    ],
    timeline: [
      sampleTimelineRecord,
      { ...sampleTimelineRecord, id: "tl_2", clientCode: "C-002" },
    ],
    assessments: [
      sampleRiskAssessment,
      { ...sampleRiskAssessment, id: "ra_2", clientCode: "C-002" },
    ],
    goals: [
      sampleInterventionGoal,
      { ...sampleInterventionGoal, id: "g_2", clientCode: "C-002" },
    ],
    supervisionRecords: [] as SupervisionRecord[],
    crisisWarnings: [sampleCrisisWarning],
  };
}

describe("filterDataByRole 角色数据过滤", () => {
  it("admin 角色应无业务数据，仅保留危机预警", () => {
    const data = buildFullData();
    const filtered = filterDataByRole(data, "admin");

    expect(filtered.caseRecords).toEqual([]);
    expect(filtered.timeline).toEqual([]);
    expect(filtered.assessments).toEqual([]);
    expect(filtered.goals).toEqual([]);
    expect(filtered.supervisionRecords).toEqual([]);
    expect(filtered.crisisWarnings).toHaveLength(1);
  });

  it("counselor 角色应完整获取所有业务数据（无脱敏）", () => {
    const data = buildFullData();
    const filtered = filterDataByRole(data, "counselor");

    expect(filtered.caseRecords).toHaveLength(2);
    expect(filtered.timeline).toHaveLength(2);
    expect(filtered.assessments).toHaveLength(2);
    expect(filtered.goals).toHaveLength(2);

    expect(filtered.caseRecords[0].mainConcern).toBe(data.caseRecords[0].mainConcern);
    expect(filtered.caseRecords[0].intervention).toBe(data.caseRecords[0].intervention);
  });

  it("supervisor 角色应完整获取所有业务数据（无脱敏）", () => {
    const data = buildFullData();
    const filtered = filterDataByRole(data, "supervisor");

    expect(filtered.caseRecords).toHaveLength(2);
    expect(filtered.timeline).toHaveLength(2);
    expect(filtered.assessments).toHaveLength(2);
    expect(filtered.assessments[0].dimensions).toEqual(data.assessments[0].dimensions);
  });

  it("个案记录中敏感字段按角色权限处理（counselor 有权限）", () => {
    const data = buildFullData();
    const filtered = filterDataByRole(data, "counselor");

    expect(filtered.caseRecords[0].mainConcern).toBe("工作压力大，经常失眠");
    expect(filtered.caseRecords[0].intervention).toBe("认知行为疗法");
    expect(filtered.caseRecords[0].emotionalState).toBe("紧张不安");
  });

  it("风险评估维度数据按角色权限处理（supervisor 有权限）", () => {
    const data = buildFullData();
    const filtered = filterDataByRole(data, "supervisor");

    expect(filtered.assessments[0].dimensions).toEqual({
      sleep: 2, emotion: 3, selfHarm: 1, support: 2, stress: 3,
    });
    expect(filtered.assessments[0].totalScore).toBe(11);
  });

  it("时间线中敏感字段按角色权限处理（counselor 有权限）", () => {
    const data = buildFullData();
    const filtered = filterDataByRole(data, "counselor");

    expect(filtered.timeline[0].intervention).toBe("呼吸放松训练");
    expect(filtered.timeline[0].nextGoal).toBe("记录焦虑触发场景");
    expect(filtered.timeline[0].emotionalState).toBe("紧张不安");
  });

  it("目标数据不做脱敏处理（所有有目标权限的角色）", () => {
    const data = buildFullData();
    const counselorFiltered = filterDataByRole(data, "counselor");
    const supervisorFiltered = filterDataByRole(data, "supervisor");

    expect(counselorFiltered.goals[0]).toEqual(data.goals[0]);
    expect(supervisorFiltered.goals[0]).toEqual(data.goals[0]);
  });

  it("admin 角色的危机预警应根据权限过滤 triggerReason", () => {
    const data = buildFullData();
    const filtered = filterDataByRole(data, "admin");

    expect(filtered.crisisWarnings[0].triggerReason).toBe(
      "*** 内容已脱敏，无权限查看 ***"
    );
    expect(filtered.crisisWarnings[0].actions).toEqual([]);
  });

  it("counselor 角色的危机预警应保留完整信息", () => {
    const data = buildFullData();
    const filtered = filterDataByRole(data, "counselor");

    expect(filtered.crisisWarnings[0].triggerReason).toBe("风险等级评为中风险");
    expect(filtered.crisisWarnings[0].actions).toEqual([]);
  });

  it("应不修改原始数据（返回新对象引用）", () => {
    const data = buildFullData();
    const originalCase0 = { ...data.caseRecords[0] };
    filterDataByRole(data, "counselor");

    expect(data.caseRecords[0]).toEqual(originalCase0);
  });
});

describe("getActiveClientCodes 活跃来访者代码提取", () => {
  it("应从所有数据源汇总去重并排序", () => {
    const data = buildFullData();
    const codes = getActiveClientCodes(
      filterDataByRole(data, "counselor"),
      data.caseRecords,
      data.timeline,
      data.assessments,
      data.goals
    );
    expect(codes).toEqual(["C-001", "C-002"]);
  });

  it("空数据应返回空数组", () => {
    const codes = getActiveClientCodes(
      {
        caseRecords: [],
        timeline: [],
        assessments: [],
        goals: [],
        supervisionRecords: [],
        crisisWarnings: [],
      },
      [],
      [],
      [],
      []
    );
    expect(codes).toEqual([]);
  });

  it("部分来源有数据应正确提取", () => {
    const codes = getActiveClientCodes(
      {
        caseRecords: [],
        timeline: [],
        assessments: [],
        goals: [],
        supervisionRecords: [],
        crisisWarnings: [],
      },
      [{ ...sampleCaseRecord, clientCode: "C-A" }],
      [{ ...sampleTimelineRecord, clientCode: "C-B" }],
      [],
      [{ ...sampleInterventionGoal, clientCode: "C-C" }]
    );
    expect(codes).toEqual(["C-A", "C-B", "C-C"]);
  });

  it("重复的 clientCode 应只出现一次", () => {
    const codes = getActiveClientCodes(
      {
        caseRecords: [],
        timeline: [],
        assessments: [],
        goals: [],
        supervisionRecords: [],
        crisisWarnings: [],
      },
      [
        { ...sampleCaseRecord, clientCode: "C-001" },
        { ...sampleCaseRecord, id: "cr_x", clientCode: "C-001" },
      ],
      [{ ...sampleTimelineRecord, clientCode: "C-001" }],
      [],
      []
    );
    expect(codes).toEqual(["C-001"]);
  });
});

describe("canAccessTab 菜单访问权限", () => {
  it("counselor 应能访问个案记录和时间线菜单", () => {
    expect(canAccessTab("counselor", "caseRecords")).toBe(true);
    expect(canAccessTab("counselor", "timeline")).toBe(true);
    expect(canAccessTab("counselor", "risk")).toBe(true);
    expect(canAccessTab("counselor", "goals")).toBe(true);
  });

  it("counselor 不应能访问审计日志菜单", () => {
    expect(canAccessTab("counselor", "audit")).toBe(false);
  });

  it("supervisor 应能访问审计日志菜单", () => {
    expect(canAccessTab("supervisor", "audit")).toBe(true);
  });

  it("admin 应能访问数据总览和审计日志", () => {
    expect(canAccessTab("admin", "audit")).toBe(true);
  });

  it("不存在的菜单名应返回 false", () => {
    expect(canAccessTab("counselor", "nonexistent_tab")).toBe(false);
    expect(canAccessTab("admin", "unknown")).toBe(false);
  });

  it("counselor 应能访问危机预警菜单", () => {
    expect(canAccessTab("counselor", "crisisWarning")).toBe(true);
  });
});
