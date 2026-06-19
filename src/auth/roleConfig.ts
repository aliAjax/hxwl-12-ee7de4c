export type UserRole = "counselor" | "supervisor" | "admin";

export type PermissionAction =
  | "case.view"
  | "case.create"
  | "case.edit"
  | "case.delete"
  | "case.export"
  | "timeline.view"
  | "timeline.create"
  | "timeline.edit"
  | "timeline.delete"
  | "risk.view"
  | "risk.create"
  | "risk.delete"
  | "goal.view"
  | "goal.create"
  | "goal.edit"
  | "goal.delete"
  | "supervision.view"
  | "supervision.create"
  | "supervision.submit"
  | "supervision.feedback"
  | "export.summary"
  | "export.full"
  | "data.overview"
  | "audit.view"
  | "audit.delete"
  | "system.reset"
  | "crisis.view"
  | "crisis.confirm"
  | "crisis.escalate"
  | "crisis.refer"
  | "crisis.close"
  | "crisis.delete";

export type FieldKey =
  | "case.clientCode"
  | "case.mainConcern"
  | "case.intervention"
  | "case.nextGoal"
  | "case.emotionalState"
  | "case.sessionDate"
  | "risk.dimensions"
  | "risk.summary"
  | "supervision.caseSummary"
  | "supervision.riskChanges"
  | "supervision.sessionClips"
  | "supervision.feedbackHistory";

export type MenuKey =
  | "menu.caseRecords"
  | "menu.timeline"
  | "menu.riskAssessment"
  | "menu.goalTracking"
  | "menu.supervision"
  | "menu.export"
  | "menu.dataOverview"
  | "menu.auditLog"
  | "menu.crisisWarning";

export interface RoleConfig {
  label: string;
  description: string;
  color: string;
  icon: string;
  permissions: PermissionAction[];
  visibleFields: FieldKey[];
  visibleMenus: MenuKey[];
  exportScopes: ExportScope[];
}

export interface ExportScope {
  key: string;
  label: string;
  includes: string[];
  desensitized: boolean;
}

export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  counselor: {
    label: "咨询师",
    description: "日常个案管理与记录录入",
    color: "#7c3aed",
    icon: "👩‍⚕️",
    permissions: [
      "case.view",
      "case.create",
      "case.edit",
      "case.delete",
      "case.export",
      "timeline.view",
      "timeline.create",
      "timeline.edit",
      "timeline.delete",
      "risk.view",
      "risk.create",
      "risk.delete",
      "goal.view",
      "goal.create",
      "goal.edit",
      "goal.delete",
      "supervision.view",
      "supervision.create",
      "supervision.submit",
      "export.summary",
      "audit.view",
      "crisis.view",
      "crisis.confirm",
      "crisis.close",
    ],
    visibleFields: [
      "case.clientCode",
      "case.mainConcern",
      "case.intervention",
      "case.nextGoal",
      "case.emotionalState",
      "case.sessionDate",
      "risk.dimensions",
      "risk.summary",
      "supervision.caseSummary",
      "supervision.riskChanges",
      "supervision.sessionClips",
      "supervision.feedbackHistory",
    ],
    visibleMenus: [
      "menu.caseRecords",
      "menu.timeline",
      "menu.riskAssessment",
      "menu.goalTracking",
      "menu.supervision",
      "menu.export",
      "menu.crisisWarning",
    ],
    exportScopes: [
      {
        key: "counselor_summary",
        label: "咨询摘要（已脱敏）",
        includes: ["基本主题", "关键干预", "目标进展", "下次计划"],
        desensitized: true,
      },
    ],
  },
  supervisor: {
    label: "督导",
    description: "个案评审与督导反馈",
    color: "#0f766e",
    icon: "🎯",
    permissions: [
      "case.view",
      "case.export",
      "timeline.view",
      "risk.view",
      "goal.view",
      "supervision.view",
      "supervision.feedback",
      "export.summary",
      "export.full",
      "audit.view",
      "crisis.view",
      "crisis.confirm",
      "crisis.escalate",
      "crisis.refer",
      "crisis.close",
    ],
    visibleFields: [
      "case.clientCode",
      "case.mainConcern",
      "case.intervention",
      "case.nextGoal",
      "case.emotionalState",
      "case.sessionDate",
      "risk.dimensions",
      "risk.summary",
      "supervision.caseSummary",
      "supervision.riskChanges",
      "supervision.sessionClips",
      "supervision.feedbackHistory",
    ],
    visibleMenus: [
      "menu.caseRecords",
      "menu.timeline",
      "menu.riskAssessment",
      "menu.goalTracking",
      "menu.supervision",
      "menu.export",
      "menu.auditLog",
      "menu.crisisWarning",
    ],
    exportScopes: [
      {
        key: "supervisor_summary",
        label: "督导摘要（已脱敏）",
        includes: ["基本主题", "风险变化", "关键干预", "目标进展", "下次计划"],
        desensitized: true,
      },
      {
        key: "supervisor_full",
        label: "完整督导报告（含原始数据）",
        includes: ["全部会谈记录", "完整风险评估", "干预目标详情", "督导历史反馈"],
        desensitized: false,
      },
    ],
  },
  admin: {
    label: "机构管理员",
    description: "数据总览与系统管理",
    color: "#f59e0b",
    icon: "🔧",
    permissions: [
      "case.view",
      "case.export",
      "timeline.view",
      "risk.view",
      "goal.view",
      "supervision.view",
      "export.summary",
      "export.full",
      "data.overview",
      "audit.view",
      "audit.delete",
      "system.reset",
      "crisis.view",
      "crisis.confirm",
      "crisis.escalate",
      "crisis.refer",
      "crisis.close",
      "crisis.delete",
    ],
    visibleFields: [],
    visibleMenus: [
      "menu.dataOverview",
      "menu.export",
      "menu.auditLog",
    ],
    exportScopes: [
      {
        key: "admin_aggregate",
        label: "机构汇总报表",
        includes: ["个案数量统计", "风险等级分布", "咨询主题分布", "目标完成率"],
        desensitized: true,
      },
      {
        key: "admin_full",
        label: "完整数据导出（含审计日志）",
        includes: ["全部业务数据", "审计日志记录", "操作行为追踪"],
        desensitized: false,
      },
    ],
  },
};

export const ALL_ROLES: UserRole[] = ["counselor", "supervisor", "admin"];

export const ROLE_LABELS: Record<UserRole, string> = {
  counselor: "咨询师",
  supervisor: "督导",
  admin: "机构管理员",
};

export const DEFAULT_ROLE: UserRole = "counselor";
