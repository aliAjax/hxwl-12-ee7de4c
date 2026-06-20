import type {
  TimelineRecord,
  RiskAssessment,
  InterventionGoal,
  CaseRecord,
  CrisisWarning,
  UserRole,
} from "../App";
import type { AuditLogEntry } from "../auth/auditLog";
import { getAllAuditLogs, STORAGE_KEY as AUDIT_STORAGE_KEY } from "../auth/auditLog";
import { desensitizeText, type MaskedItemInfo } from "./desensitize";

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_MAGIC = "HXWL-BACKUP";
export const BACKUP_FILE_EXTENSION = ".hxwl-backup.json";

export interface BackupMetaData {
  nextTimelineId: number;
  nextRiskId: number;
  nextGoalId: number;
  nextCaseRecordId: number;
  nextCrisisWarningId: number;
  seeded?: boolean;
  seededAt?: string;
  dbVersion: number;
  [key: string]: unknown;
}

export interface BackupData {
  caseRecords: CaseRecord[];
  timeline: TimelineRecord[];
  riskAssessments: RiskAssessment[];
  goals: InterventionGoal[];
  crisisWarnings: CrisisWarning[];
  meta: BackupMetaData;
  auditLogs: AuditLogEntry[];
}

export interface BackupFile {
  magic: typeof BACKUP_FILE_MAGIC;
  formatVersion: number;
  backupDate: string;
  appId: string;
  appVersion: string;
  dbVersion: number;
  exportedBy: {
    role: UserRole;
    name: string;
  };
  data: BackupData;
  checksums: Record<string, string>;
  stats: BackupStats;
}

export interface BackupStats {
  caseRecords: number;
  timeline: number;
  riskAssessments: number;
  goals: number;
  crisisWarnings: number;
  auditLogs: number;
  totalRecords: number;
}

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  details?: string;
  affectedStore?: string;
  affectedCount?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  structureValid: boolean;
  versionCompatible: boolean;
  sensitiveFields: SensitiveFieldInfo[];
}

export interface SensitiveFieldInfo {
  store: string;
  field: string;
  sampleMasked: string;
  count: number;
  types: MaskedItemInfo["type"][];
}

export interface ConflictInfo {
  store: string;
  id: string;
  type: "update" | "new";
  currentValue?: unknown;
  importValue: unknown;
  label?: string;
}

export interface ImportPreview {
  summary: {
    newRecords: number;
    updatedRecords: number;
    unchangedRecords: number;
    totalConflicts: number;
    byStore: Record<string, { new: number; update: number; unchanged: number }>;
  };
  conflicts: ConflictInfo[];
}

export type ImportMode = "merge" | "overwrite" | "skip";

export interface ImportOptions {
  mode: ImportMode;
  includeAuditLogs: boolean;
  confirmConflicts: boolean;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function computeChecksums(data: BackupData): Record<string, string> {
  return {
    caseRecords: simpleHash(JSON.stringify(data.caseRecords)),
    timeline: simpleHash(JSON.stringify(data.timeline)),
    riskAssessments: simpleHash(JSON.stringify(data.riskAssessments)),
    goals: simpleHash(JSON.stringify(data.goals)),
    crisisWarnings: simpleHash(JSON.stringify(data.crisisWarnings)),
    meta: simpleHash(JSON.stringify(data.meta)),
    auditLogs: simpleHash(JSON.stringify(data.auditLogs)),
  };
}

function computeStats(data: BackupData): BackupStats {
  return {
    caseRecords: data.caseRecords.length,
    timeline: data.timeline.length,
    riskAssessments: data.riskAssessments.length,
    goals: data.goals.length,
    crisisWarnings: data.crisisWarnings.length,
    auditLogs: data.auditLogs.length,
    totalRecords:
      data.caseRecords.length +
      data.timeline.length +
      data.riskAssessments.length +
      data.goals.length +
      data.crisisWarnings.length +
      data.auditLogs.length,
  };
}

export function createBackupFile(params: {
  data: BackupData;
  exportedByRole: UserRole;
  exportedByName: string;
  appId?: string;
  appVersion?: string;
}): BackupFile {
  const { data, exportedByRole, exportedByName, appId = "hxwl-12", appVersion = "1.0.0" } = params;

  const backup: BackupFile = {
    magic: BACKUP_FILE_MAGIC,
    formatVersion: BACKUP_FORMAT_VERSION,
    backupDate: new Date().toISOString(),
    appId,
    appVersion,
    dbVersion: data.meta.dbVersion,
    exportedBy: {
      role: exportedByRole,
      name: exportedByName,
    },
    data,
    checksums: computeChecksums(data),
    stats: computeStats(data),
  };

  return backup;
}

export function validateBackupFile(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  let structureValid = true;
  let versionCompatible = true;
  const sensitiveFields: SensitiveFieldInfo[] = [];

  if (typeof raw !== "object" || raw === null) {
    issues.push({
      severity: "error",
      code: "INVALID_FORMAT",
      message: "文件格式错误：不是有效的JSON对象",
    });
    return { valid: false, issues, structureValid: false, versionCompatible: false, sensitiveFields: [] };
  }

  const obj = raw as Record<string, unknown>;

  if (obj.magic !== BACKUP_FILE_MAGIC) {
    issues.push({
      severity: "error",
      code: "INVALID_MAGIC",
      message: "不是有效的备份文件：缺少文件标识",
      details: `期望 ${BACKUP_FILE_MAGIC}，实际为 ${obj.magic || "无"}`,
    });
    structureValid = false;
  }

  if (typeof obj.formatVersion !== "number") {
    issues.push({
      severity: "error",
      code: "INVALID_VERSION",
      message: "备份文件格式版本无效",
    });
    structureValid = false;
  } else if (obj.formatVersion > BACKUP_FORMAT_VERSION) {
    issues.push({
      severity: "error",
      code: "VERSION_TOO_NEW",
      message: `备份文件版本（v${obj.formatVersion}）高于当前系统支持的版本（v${BACKUP_FORMAT_VERSION}）`,
      details: "请升级系统后再尝试导入",
    });
    versionCompatible = false;
    structureValid = false;
  } else if (obj.formatVersion < BACKUP_FORMAT_VERSION) {
    issues.push({
      severity: "warning",
      code: "VERSION_OLD",
      message: `备份文件版本（v${obj.formatVersion}）较旧，将以兼容模式导入`,
      details: "部分新功能的数据可能缺失",
    });
  }

  if (typeof obj.appId !== "string" || !obj.appId.startsWith("hxwl")) {
    issues.push({
      severity: "warning",
      code: "UNKNOWN_APP",
      message: `备份文件来自未知应用：${obj.appId || "未知"}`,
    });
  }

  if (!obj.data || typeof obj.data !== "object") {
    issues.push({
      severity: "error",
      code: "MISSING_DATA",
      message: "备份文件中缺少数据部分",
    });
    structureValid = false;
  }

  if (!structureValid) {
    return { valid: false, issues, structureValid, versionCompatible, sensitiveFields: [] };
  }

  const data = obj.data as Record<string, unknown>;

  const requiredStores = ["caseRecords", "timeline", "riskAssessments", "goals", "crisisWarnings", "meta", "auditLogs"];
  for (const store of requiredStores) {
    if (!(store in data)) {
      issues.push({
        severity: "warning",
        code: `MISSING_${store.toUpperCase()}`,
        message: `备份文件中缺少 ${store} 数据，导入时该部分将保持不变`,
        affectedStore: store,
      });
    }
  }

  if (Array.isArray(data.caseRecords)) {
    const sampleField = findSensitiveInArray(data.caseRecords as Record<string, unknown>[], ["mainConcern", "intervention", "nextGoal", "consultationTopic"]);
    if (sampleField) sensitiveFields.push({ store: "个案记录", field: sampleField.field, sampleMasked: sampleField.masked, count: sampleField.count, types: sampleField.types });
  }

  if (Array.isArray(data.timeline)) {
    const sampleField = findSensitiveInArray(data.timeline as Record<string, unknown>[], ["topic", "intervention", "nextGoal", "emotionalState"]);
    if (sampleField) sensitiveFields.push({ store: "会谈时间线", field: sampleField.field, sampleMasked: sampleField.masked, count: sampleField.count, types: sampleField.types });
  }

  if (Array.isArray(data.riskAssessments)) {
    const sampleField = findSensitiveInArray(data.riskAssessments as Record<string, unknown>[], ["summary", "explanation"]);
    if (sampleField) sensitiveFields.push({ store: "风险评估", field: sampleField.field, sampleMasked: sampleField.masked, count: sampleField.count, types: sampleField.types });
  }

  if (Array.isArray(data.goals)) {
    const sampleField = findSensitiveInArray(data.goals as Record<string, unknown>[], ["goalTitle", "description", "lastAction", "nextPractice"]);
    if (sampleField) sensitiveFields.push({ store: "干预目标", field: sampleField.field, sampleMasked: sampleField.masked, count: sampleField.count, types: sampleField.types });
  }

  if (Array.isArray(data.crisisWarnings)) {
    const sampleField = findSensitiveInArray(data.crisisWarnings as Record<string, unknown>[], ["triggerReason"]);
    if (sampleField) sensitiveFields.push({ store: "危机预警", field: sampleField.field, sampleMasked: sampleField.masked, count: sampleField.count, types: sampleField.types });
  }

  if (Array.isArray(data.auditLogs)) {
    const sampleField = findSensitiveInArray(data.auditLogs as Record<string, unknown>[], ["message"]);
    if (sampleField) sensitiveFields.push({ store: "审计日志", field: sampleField.field, sampleMasked: sampleField.masked, count: sampleField.count, types: sampleField.types });
  }

  const hasErrors = issues.some(i => i.severity === "error");

  return {
    valid: !hasErrors,
    issues,
    structureValid,
    versionCompatible,
    sensitiveFields,
  };
}

function findSensitiveInArray(
  records: Record<string, unknown>[],
  fields: string[]
): { field: string; masked: string; count: number; types: MaskedItemInfo["type"][] } | null {
  let foundField: string | null = null;
  let sampleMasked = "";
  let totalCount = 0;
  const allTypes = new Set<MaskedItemInfo["type"]>();

  for (const field of fields) {
    let fieldCount = 0;
    let firstMasked = "";
    for (const record of records) {
      const value = record[field];
      if (typeof value === "string") {
        const { text, maskedItems } = desensitizeText(value);
        if (maskedItems.length > 0) {
          fieldCount++;
          if (!firstMasked) {
            firstMasked = text.length > 100 ? text.slice(0, 100) + "..." : text;
          }
          maskedItems.forEach(item => allTypes.add(item.type));
        }
      }
    }
    if (fieldCount > 0) {
      foundField = field;
      sampleMasked = firstMasked;
      totalCount = fieldCount;
      break;
    }
  }

  if (!foundField) return null;
  return { field: foundField, masked: sampleMasked, count: totalCount, types: Array.from(allTypes) };
}

export function parseBackupFile(text: string): BackupFile {
  const parsed = JSON.parse(text);
  const validation = validateBackupFile(parsed);
  if (!validation.valid) {
    const errors = validation.issues.filter(i => i.severity === "error");
    throw new Error(`备份文件校验失败：${errors[0]?.message || "未知错误"}`);
  }
  return parsed as BackupFile;
}

export function generateImportPreview(
  backup: BackupFile,
  currentData: {
    caseRecords: CaseRecord[];
    timeline: TimelineRecord[];
    riskAssessments: RiskAssessment[];
    goals: InterventionGoal[];
    crisisWarnings: CrisisWarning[];
  }
): ImportPreview {
  const byStore: ImportPreview["summary"]["byStore"] = {
    caseRecords: { new: 0, update: 0, unchanged: 0 },
    timeline: { new: 0, update: 0, unchanged: 0 },
    riskAssessments: { new: 0, update: 0, unchanged: 0 },
    goals: { new: 0, update: 0, unchanged: 0 },
    crisisWarnings: { new: 0, update: 0, unchanged: 0 },
  };

  const conflicts: ConflictInfo[] = [];

  const currentMap = {
    caseRecords: new Map(currentData.caseRecords.map(r => [r.id, r])),
    timeline: new Map(currentData.timeline.map(r => [r.id, r])),
    riskAssessments: new Map(currentData.riskAssessments.map(r => [r.id, r])),
    goals: new Map(currentData.goals.map(r => [r.id, r])),
    crisisWarnings: new Map(currentData.crisisWarnings.map(r => [r.id, r])),
  };

  const importArrays: [keyof typeof currentMap, (item: unknown) => string][] = [
    ["caseRecords", (item) => (item as CaseRecord).id],
    ["timeline", (item) => (item as TimelineRecord).id],
    ["riskAssessments", (item) => (item as RiskAssessment).id],
    ["goals", (item) => (item as InterventionGoal).id],
    ["crisisWarnings", (item) => (item as CrisisWarning).id],
  ];

  const storeLabels: Record<string, string> = {
    caseRecords: "个案记录",
    timeline: "会谈时间线",
    riskAssessments: "风险评估",
    goals: "干预目标",
    crisisWarnings: "危机预警",
  };

  for (const [storeName, getId] of importArrays) {
    const importItems = (backup.data[storeName] ?? []) as unknown[];
    const currentMapForStore = currentMap[storeName];

    for (const item of importItems) {
      const id = getId(item);
      const existing = currentMapForStore.get(id);

      if (!existing) {
        byStore[storeName].new++;
      } else {
        const existingJson = JSON.stringify(existing);
        const importJson = JSON.stringify(item);

        if (existingJson === importJson) {
          byStore[storeName].unchanged++;
        } else {
          byStore[storeName].update++;
          conflicts.push({
            store: storeLabels[storeName] || storeName,
            id,
            type: "update",
            currentValue: existing,
            importValue: item,
            label: (item as { clientCode?: string })?.clientCode || id,
          });
        }
      }
    }
  }

  const summary = {
    newRecords: Object.values(byStore).reduce((sum, s) => sum + s.new, 0),
    updatedRecords: Object.values(byStore).reduce((sum, s) => sum + s.update, 0),
    unchangedRecords: Object.values(byStore).reduce((sum, s) => sum + s.unchanged, 0),
    totalConflicts: conflicts.length,
    byStore,
  };

  return { summary, conflicts };
}

export function downloadBackupFile(backup: BackupFile): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `hxwl12_backup_${dateStr}${BACKUP_FILE_EXTENSION}`;

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export { AUDIT_STORAGE_KEY };
