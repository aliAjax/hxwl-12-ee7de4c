import type { UserRole, FieldKey, MenuKey } from "./roleConfig";
import { canViewField, hasPermission, canViewMenu } from "./permissions";
import type {
  CaseRecord,
  TimelineRecord,
  RiskAssessment,
  InterventionGoal,
  SupervisionRecord,
  CrisisWarning,
} from "../App";
import { desensitizeText } from "../utils/desensitize";

function getDesensitizedText(text: string): string {
  if (!text) return "";
  const result = desensitizeText(text);
  return result.text;
}

function maskSensitiveContent(text: string, fullMask: boolean = false): string {
  if (!text) return "";
  if (fullMask) {
    return "*** 内容已脱敏，无权限查看 ***";
  }
  return getDesensitizedText(text);
}

export interface FilteredData {
  caseRecords: CaseRecord[];
  timeline: TimelineRecord[];
  assessments: RiskAssessment[];
  goals: InterventionGoal[];
  supervisionRecords: SupervisionRecord[];
  crisisWarnings: CrisisWarning[];
}

const SENSITIVE_FIELDS: FieldKey[] = [
  "case.mainConcern",
  "case.intervention",
  "case.nextGoal",
  "case.emotionalState",
  "risk.dimensions",
  "risk.summary",
  "supervision.caseSummary",
  "supervision.riskChanges",
  "supervision.sessionClips",
  "supervision.feedbackHistory",
];

function filterCaseRecord(record: CaseRecord, role: UserRole): CaseRecord {
  const filtered: CaseRecord = { ...record };

  if (!canViewField(role, "case.mainConcern")) {
    filtered.mainConcern = maskSensitiveContent(record.mainConcern, true);
  }
  if (!canViewField(role, "case.intervention")) {
    filtered.intervention = maskSensitiveContent(record.intervention, true);
  }
  if (!canViewField(role, "case.nextGoal")) {
    filtered.nextGoal = maskSensitiveContent(record.nextGoal, true);
  }
  if (!canViewField(role, "case.emotionalState")) {
    filtered.emotionalState = "***";
  }

  return filtered;
}

function filterTimelineRecord(record: TimelineRecord, role: UserRole): TimelineRecord {
  const filtered: TimelineRecord = { ...record };

  if (!canViewField(role, "case.emotionalState")) {
    filtered.emotionalState = "***";
  }
  if (!canViewField(role, "case.intervention")) {
    filtered.intervention = maskSensitiveContent(record.intervention, true);
  }
  if (!canViewField(role, "case.nextGoal")) {
    filtered.nextGoal = maskSensitiveContent(record.nextGoal, true);
  }

  return filtered;
}

function filterRiskAssessment(assessment: RiskAssessment, role: UserRole): RiskAssessment {
  const filtered: RiskAssessment = { ...assessment };

  if (!canViewField(role, "risk.dimensions")) {
    filtered.dimensions = {
      sleep: 0,
      emotion: 0,
      selfHarm: 0,
      support: 0,
      stress: 0,
    };
    filtered.totalScore = 0;
  }
  if (!canViewField(role, "risk.summary")) {
    filtered.summary = maskSensitiveContent(assessment.summary, true);
  }
  if (filtered.explanation && !canViewField(role, "risk.summary")) {
    filtered.explanation = maskSensitiveContent(filtered.explanation, true);
  }

  return filtered;
}

function filterGoal(goal: InterventionGoal, role: UserRole): InterventionGoal {
  return { ...goal };
}

function filterSupervisionRecord(record: SupervisionRecord, role: UserRole): SupervisionRecord {
  const filtered: SupervisionRecord = { ...record };

  if (!canViewField(role, "supervision.caseSummary")) {
    filtered.caseSummary = maskSensitiveContent(record.caseSummary, true);
  }
  if (!canViewField(role, "supervision.riskChanges")) {
    filtered.riskChanges = maskSensitiveContent(record.riskChanges, true);
  }
  if (!canViewField(role, "supervision.sessionClips")) {
    filtered.sessionClips = [];
  }
  if (!canViewField(role, "supervision.feedbackHistory")) {
    filtered.feedbackHistory = [];
  }

  return filtered;
}

function filterCrisisWarning(warning: CrisisWarning, role: UserRole): CrisisWarning {
  const filtered: CrisisWarning = { ...warning };

  if (role === "admin" || !hasPermission(role, "crisis.view").allowed) {
    filtered.triggerReason = maskSensitiveContent(warning.triggerReason, true);
    filtered.actions = [];
  }

  return filtered;
}

export function filterDataByRole(
  data: {
    caseRecords: CaseRecord[];
    timeline: TimelineRecord[];
    assessments: RiskAssessment[];
    goals: InterventionGoal[];
    supervisionRecords: SupervisionRecord[];
    crisisWarnings: CrisisWarning[];
  },
  role: UserRole
): FilteredData {
  const canViewDetailedData = canViewField(role, "case.mainConcern");

  if (role === "admin") {
    return {
      caseRecords: [],
      timeline: [],
      assessments: [],
      goals: [],
      supervisionRecords: [],
      crisisWarnings: data.crisisWarnings.map(w => filterCrisisWarning(w, role)),
    };
  }

  return {
    caseRecords: data.caseRecords.map(r => filterCaseRecord(r, role)),
    timeline: data.timeline.map(r => filterTimelineRecord(r, role)),
    assessments: data.assessments.map(r => filterRiskAssessment(r, role)),
    goals: data.goals.map(r => filterGoal(r, role)),
    supervisionRecords: data.supervisionRecords.map(r => filterSupervisionRecord(r, role)),
    crisisWarnings: data.crisisWarnings.map(r => filterCrisisWarning(r, role)),
  };
}

export function getActiveClientCodes(
  data: FilteredData,
  originalCaseRecords: CaseRecord[],
  originalTimeline: TimelineRecord[],
  originalAssessments: RiskAssessment[],
  originalGoals: InterventionGoal[]
): string[] {
  const codesFromTimeline = Array.from(new Set(originalTimeline.map(r => r.clientCode)));
  const codesFromAssess = Array.from(new Set(originalAssessments.map(r => r.clientCode)));
  const codesFromGoals = Array.from(new Set(originalGoals.map(r => r.clientCode)));
  const codesFromCaseRecords = Array.from(new Set(originalCaseRecords.map(r => r.clientCode)));

  return Array.from(new Set([
    ...codesFromTimeline,
    ...codesFromAssess,
    ...codesFromGoals,
    ...codesFromCaseRecords
  ])).sort();
}

export function canAccessTab(role: UserRole, tab: string): boolean {
  const menuMap: Record<string, MenuKey> = {
    caseRecords: "menu.caseRecords",
    timeline: "menu.timeline",
    risk: "menu.riskAssessment",
    goals: "menu.goalTracking",
    supervision: "menu.supervision",
    crisisWarning: "menu.crisisWarning",
    export: "menu.export",
    audit: "menu.auditLog",
    dataOverview: "menu.dataOverview",
  };

  const menuKey = menuMap[tab];
  if (!menuKey) return false;

  return canViewMenu(role, menuKey);
}

export function createPermissionDeniedHandler(
  role: UserRole,
  showToast: (message: string, type?: "error" | "success" | "info") => void,
  createAudit: (params: {
    action: Parameters<typeof import("./auditLog").createAuditLog>[0]["action"];
    targetType: Parameters<typeof import("./auditLog").createAuditLog>[0]["targetType"];
    targetId?: string;
    targetLabel?: string;
    permissionChecked?: import("./roleConfig").PermissionAction;
    status?: Parameters<typeof import("./auditLog").createAuditLog>[0]["status"];
    details?: Record<string, unknown>;
    message?: string;
  }) => void
) {
  return function handlePermissionDenied(
    permission: import("./roleConfig").PermissionAction,
    targetType: Parameters<typeof import("./auditLog").createAuditLog>[0]["targetType"],
    targetId?: string,
    targetLabel?: string,
    customMessage?: string
  ) {
    const result = hasPermission(role, permission);

    showToast(
      customMessage || result.reason || "无权限执行此操作",
      "error"
    );

    createAudit({
      action: "view",
      targetType,
      targetId,
      targetLabel,
      permissionChecked: permission,
      status: "denied",
      message: customMessage || `操作被拒绝：${result.reason}`,
    });

    return false;
  };
}
