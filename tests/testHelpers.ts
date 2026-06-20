import type { CaseRecord, TimelineRecord, RiskAssessment, InterventionGoal, CrisisWarning } from "../src/App";
import { createBackupFile, type BackupFile, type BackupData } from "../src/utils/backupImport";

export function createEmptyBackupData(): BackupData {
  return {
    caseRecords: [],
    timeline: [],
    riskAssessments: [],
    goals: [],
    crisisWarnings: [],
    auditLogs: [],
    meta: {
      nextTimelineId: 1,
      nextRiskId: 1,
      nextGoalId: 1,
      nextCaseRecordId: 1,
      nextCrisisWarningId: 1,
      dbVersion: 3,
    },
  };
}

export function createValidBackupFile(overrides: Partial<BackupFile> = {}): BackupFile {
  const base = createBackupFile({
    data: createEmptyBackupData(),
    exportedByRole: "admin",
    exportedByName: "测试管理员",
  });
  return { ...base, ...overrides };
}

export const sampleCaseRecord: CaseRecord = {
  id: "cr_test_1",
  clientCode: "C-001",
  consultationTopic: "焦虑障碍",
  sessionDate: "2026-06-01",
  mainConcern: "工作压力大，经常失眠",
  emotionalState: "紧张不安",
  intervention: "认知行为疗法",
  nextGoal: "学习放松技巧",
  createdAt: "2026-06-01T10:00:00Z",
  updatedAt: "2026-06-01T10:00:00Z",
};

export const sampleTimelineRecord: TimelineRecord = {
  id: "tl_test_1",
  clientCode: "C-001",
  sessionDate: "2026-06-01",
  topic: "焦虑",
  emotionalState: "紧张不安",
  intervention: "呼吸放松训练",
  nextGoal: "记录焦虑触发场景",
};

export const sampleRiskAssessment: RiskAssessment = {
  id: "ra_test_1",
  clientCode: "C-001",
  assessDate: "2026-06-01",
  dimensions: { sleep: 2, emotion: 3, selfHarm: 1, support: 2, stress: 3 },
  totalScore: 11,
  level: "medium",
  summary: "情绪波动较大，需持续关注",
};

export const sampleInterventionGoal: InterventionGoal = {
  id: "g_test_1",
  clientCode: "C-001",
  goalTitle: "焦虑管理",
  description: "学习和掌握焦虑管理技巧",
  status: "active",
  totalSteps: 5,
  completedSteps: 2,
  lastAction: "完成呼吸放松练习",
  lastActionDate: "2026-06-15",
  nextPractice: "每日放松练习",
  nextPracticeDate: "2026-06-22",
  createdAt: "2026-06-01",
};

export const sampleCrisisWarning: CrisisWarning = {
  id: "cw_test_1",
  clientCode: "C-001",
  triggerType: "risk_assessment",
  triggerId: "ra_test_1",
  triggerReason: "风险等级评为中风险",
  status: "pending",
  createdAt: "2026-06-01T10:00:00Z",
  updatedAt: "2026-06-01T10:00:00Z",
  actions: [],
};

export function createBackupFileWithData(): BackupFile {
  const data: BackupData = {
    caseRecords: [sampleCaseRecord],
    timeline: [sampleTimelineRecord],
    riskAssessments: [sampleRiskAssessment],
    goals: [sampleInterventionGoal],
    crisisWarnings: [sampleCrisisWarning],
    auditLogs: [],
    meta: {
      nextTimelineId: 2,
      nextRiskId: 2,
      nextGoalId: 2,
      nextCaseRecordId: 2,
      nextCrisisWarningId: 2,
      dbVersion: 3,
    },
  };
  return createBackupFile({
    data,
    exportedByRole: "admin",
    exportedByName: "测试管理员",
  });
}

export const currentStateData = {
  caseRecords: [
    { ...sampleCaseRecord, id: "cr_existing_1", clientCode: "C-001", sessionDate: "2026-05-15" },
    { ...sampleCaseRecord, id: "cr_existing_2", clientCode: "C-002" },
  ] as CaseRecord[],
  timeline: [
    { ...sampleTimelineRecord, id: "tl_existing_1" },
  ] as TimelineRecord[],
  riskAssessments: [
    { ...sampleRiskAssessment, id: "ra_existing_1" },
  ] as RiskAssessment[],
  goals: [
    { ...sampleInterventionGoal, id: "g_existing_1" },
  ] as InterventionGoal[],
  crisisWarnings: [
    { ...sampleCrisisWarning, id: "cw_existing_1" },
  ] as CrisisWarning[],
};
