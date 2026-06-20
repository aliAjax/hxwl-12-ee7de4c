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

type FieldValidator = {
  required: boolean;
  type: "string" | "number" | "boolean" | "array" | "object";
  enum?: readonly string[];
  validator?: (value: unknown, record: Record<string, unknown>, allRecords: Record<string, unknown>[]) => string | null;
};

type StoreSchema = Record<string, FieldValidator>;

const CASE_RECORD_SCHEMA: StoreSchema = {
  id: { required: true, type: "string" },
  clientCode: { required: true, type: "string" },
  consultationTopic: { required: true, type: "string" },
  sessionDate: { required: true, type: "string" },
  mainConcern: { required: true, type: "string" },
  emotionalState: { required: true, type: "string" },
  intervention: { required: true, type: "string" },
  nextGoal: { required: true, type: "string" },
  createdAt: { required: true, type: "string" },
  updatedAt: { required: true, type: "string" },
};

const TIMELINE_RECORD_SCHEMA: StoreSchema = {
  id: { required: true, type: "string" },
  clientCode: { required: true, type: "string" },
  sessionDate: { required: true, type: "string" },
  topic: { required: true, type: "string" },
  emotionalState: { required: true, type: "string" },
  intervention: { required: true, type: "string" },
  nextGoal: { required: true, type: "string" },
  eventType: { required: false, type: "string" },
};

const RISK_ASSESSMENT_SCHEMA: StoreSchema = {
  id: { required: true, type: "string" },
  clientCode: { required: true, type: "string" },
  assessDate: { required: true, type: "string" },
  dimensions: {
    required: true,
    type: "object",
    validator: (value) => {
      if (typeof value !== "object" || value === null) return "dimensions 必须是对象";
      const dims = value as Record<string, unknown>;
      const required = ["sleep", "emotion", "selfHarm", "support", "stress"];
      for (const k of required) {
        if (!(k in dims)) return `dimensions 缺少字段 ${k}`;
        if (typeof dims[k] !== "number") return `dimensions.${k} 必须是数字`;
      }
      return null;
    },
  },
  totalScore: { required: true, type: "number" },
  level: { required: true, type: "string", enum: ["stable", "watch", "medium", "high"] as const },
  summary: { required: true, type: "string" },
  explanation: { required: false, type: "string" },
  createdAt: { required: false, type: "string" },
};

const INTERVENTION_GOAL_SCHEMA: StoreSchema = {
  id: { required: true, type: "string" },
  clientCode: { required: true, type: "string" },
  goalTitle: { required: true, type: "string" },
  description: { required: true, type: "string" },
  status: { required: true, type: "string", enum: ["active", "paused", "completed"] as const },
  totalSteps: { required: true, type: "number" },
  completedSteps: { required: true, type: "number" },
  lastAction: { required: true, type: "string" },
  lastActionDate: { required: true, type: "string" },
  nextPractice: { required: true, type: "string" },
  nextPracticeDate: { required: true, type: "string" },
  createdAt: { required: true, type: "string" },
};

const CRISIS_WARNING_SCHEMA: StoreSchema = {
  id: { required: true, type: "string" },
  clientCode: { required: true, type: "string" },
  triggerType: { required: true, type: "string", enum: ["risk_assessment", "case_record"] as const },
  triggerId: { required: true, type: "string" },
  triggerReason: { required: true, type: "string" },
  status: { required: true, type: "string", enum: ["pending", "confirmed", "escalated", "referred", "closed"] as const },
  createdAt: { required: true, type: "string" },
  updatedAt: { required: true, type: "string" },
  actions: {
    required: true,
    type: "array",
    validator: (value) => {
      if (!Array.isArray(value)) return "actions 必须是数组";
      for (let i = 0; i < value.length; i++) {
        const a = value[i] as Record<string, unknown>;
        if (!a || typeof a !== "object") return `actions[${i}] 必须是对象`;
        const required = ["id", "fromStatus", "toStatus", "handler", "handledAt", "description"];
        for (const k of required) {
          if (!(k in a)) return `actions[${i}] 缺少字段 ${k}`;
        }
      }
      return null;
    },
  },
};

const AUDIT_LOG_SCHEMA: StoreSchema = {
  id: { required: true, type: "string" },
  timestamp: { required: true, type: "string" },
  actorRole: { required: true, type: "string", enum: ["counselor", "supervisor", "admin"] as const },
  actorName: { required: true, type: "string" },
  action: { required: true, type: "string" },
  targetType: { required: true, type: "string" },
  status: { required: true, type: "string", enum: ["success", "denied", "failed"] as const },
  targetId: { required: false, type: "string" },
  targetLabel: { required: false, type: "string" },
  permissionChecked: { required: false, type: "string" },
  ip: { required: false, type: "string" },
  userAgent: { required: false, type: "string" },
  details: { required: false, type: "object" },
  message: { required: false, type: "string" },
};

const STORE_SCHEMAS: Record<string, StoreSchema> = {
  caseRecords: CASE_RECORD_SCHEMA,
  timeline: TIMELINE_RECORD_SCHEMA,
  riskAssessments: RISK_ASSESSMENT_SCHEMA,
  goals: INTERVENTION_GOAL_SCHEMA,
  crisisWarnings: CRISIS_WARNING_SCHEMA,
  auditLogs: AUDIT_LOG_SCHEMA,
};

const STORE_LABELS: Record<string, string> = {
  caseRecords: "个案记录",
  timeline: "会谈时间线",
  riskAssessments: "风险评估",
  goals: "干预目标",
  crisisWarnings: "危机预警",
  auditLogs: "审计日志",
};

const TYPE_LABEL: Record<string, string> = {
  string: "字符串",
  number: "数字",
  boolean: "布尔值",
  array: "数组",
  object: "对象",
};

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

function getTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateType(value: unknown, expected: FieldValidator["type"]): boolean {
  const actual = getTypeOf(value);
  if (expected === "object") return actual === "object";
  return actual === expected;
}

function validateRecord(
  record: unknown,
  schema: StoreSchema,
  index: number,
  storeLabel: string
): string[] {
  const errors: string[] = [];
  if (typeof record !== "object" || record === null) {
    return [`${storeLabel}[${index}] 不是有效的对象`];
  }
  const rec = record as Record<string, unknown>;

  for (const [field, rules] of Object.entries(schema)) {
    const value = rec[field];

    if (value === undefined || value === null) {
      if (rules.required) {
        errors.push(`${storeLabel}[${index}] 缺少必填字段: ${field}`);
      }
      continue;
    }

    if (!validateType(value, rules.type)) {
      errors.push(
        `${storeLabel}[${index}] 字段 ${field} 类型错误: 期望${TYPE_LABEL[rules.type] || rules.type}, 实际为${getTypeOf(value)}`
      );
      continue;
    }

    if (rules.enum && typeof value === "string" && !rules.enum.includes(value)) {
      errors.push(
        `${storeLabel}[${index}] 字段 ${field} 值 '${value}' 不在允许范围内: [${rules.enum.join(", ")}]`
      );
      continue;
    }

    if (rules.validator) {
      const customErr = rules.validator(value, rec, []);
      if (customErr) {
        errors.push(`${storeLabel}[${index}] ${customErr}`);
      }
    }
  }

  return errors;
}

function validateStore(
  data: unknown,
  storeName: string,
  schema: StoreSchema,
  issues: ValidationIssue[],
  maxErrors = 10
): { validCount: number; invalidCount: number } {
  if (!Array.isArray(data)) {
    issues.push({
      severity: "error",
      code: `INVALID_${storeName.toUpperCase()}_TYPE`,
      message: `${STORE_LABELS[storeName] || storeName} 数据必须是数组格式`,
      affectedStore: storeName,
    });
    return { validCount: 0, invalidCount: 0 };
  }

  const allRecords = data as Record<string, unknown>[];
  let invalidCount = 0;
  let errorCollected = 0;
  const idSet = new Set<string>();
  const duplicateIds: string[] = [];

  for (let i = 0; i < allRecords.length; i++) {
    const rec = allRecords[i];
    const recordErrors = validateRecord(rec, schema, i, STORE_LABELS[storeName] || storeName);
    if (recordErrors.length > 0) {
      invalidCount++;
      if (errorCollected < maxErrors) {
        issues.push({
          severity: "error",
          code: `INVALID_RECORD_${storeName.toUpperCase()}`,
          message: recordErrors[0],
          details: recordErrors.length > 1 ? recordErrors.slice(1).join("; ") : undefined,
          affectedStore: storeName,
          affectedCount: allRecords.length,
        });
        errorCollected++;
      }
    }

    const id = (rec as { id?: unknown }).id;
    if (typeof id === "string") {
      if (idSet.has(id)) {
        duplicateIds.push(id);
      } else {
        idSet.add(id);
      }
    }
  }

  if (duplicateIds.length > 0) {
    issues.push({
      severity: "error",
      code: `DUPLICATE_ID_${storeName.toUpperCase()}`,
      message: `${STORE_LABELS[storeName] || storeName} 存在 ${duplicateIds.length} 个重复ID`,
      details:
        duplicateIds.length <= 5
          ? `重复ID: ${duplicateIds.join(", ")}`
          : `前5个重复ID: ${duplicateIds.slice(0, 5).join(", ")} 等`,
      affectedStore: storeName,
      affectedCount: duplicateIds.length,
    });
    invalidCount += duplicateIds.length;
  }

  if (invalidCount > 0 && errorCollected >= maxErrors) {
    issues.push({
      severity: "warning",
      code: `TOO_MANY_ERRORS_${storeName.toUpperCase()}`,
      message: `${STORE_LABELS[storeName] || storeName} 仅显示前 ${maxErrors} 条错误，共 ${invalidCount} 条记录存在问题`,
      affectedStore: storeName,
      affectedCount: invalidCount,
    });
  }

  return { validCount: allRecords.length - invalidCount, invalidCount };
}

function validateMeta(
  meta: unknown,
  issues: ValidationIssue[]
): void {
  if (typeof meta !== "object" || meta === null) {
    issues.push({
      severity: "error",
      code: "INVALID_META",
      message: "元数据(meta)必须是对象格式",
    });
    return;
  }
  const m = meta as Record<string, unknown>;
  const counters = [
    "nextTimelineId",
    "nextRiskId",
    "nextGoalId",
    "nextCaseRecordId",
    "nextCrisisWarningId",
  ];
  for (const k of counters) {
    if (k in m && m[k] !== undefined && typeof m[k] !== "number") {
      issues.push({
        severity: "error",
        code: "INVALID_META_COUNTER",
        message: `元数据字段 ${k} 必须是数字类型`,
        affectedStore: "meta",
      });
    }
  }
  if ("dbVersion" in m && typeof m.dbVersion !== "number") {
    issues.push({
      severity: "error",
      code: "INVALID_META_DBVERSION",
      message: "元数据字段 dbVersion 必须是数字类型",
      affectedStore: "meta",
    });
  }
}

function validateChecksums(
  data: BackupData,
  checksums: Record<string, string> | undefined,
  issues: ValidationIssue[]
): void {
  if (!checksums || typeof checksums !== "object") {
    issues.push({
      severity: "warning",
      code: "CHECKSUM_MISSING",
      message: "备份文件缺少校验和，无法验证数据完整性",
      details: "建议重新导出备份文件以获得完整校验",
    });
    return;
  }

  const actual = computeChecksums(data);
  const failed: string[] = [];
  for (const store of Object.keys(actual)) {
    if (checksums[store] !== actual[store]) {
      failed.push(STORE_LABELS[store] || store);
    }
  }
  if (failed.length > 0) {
    issues.push({
      severity: "error",
      code: "CHECKSUM_MISMATCH",
      message: `数据完整性校验失败，${failed.length} 个数据块的校验和不匹配`,
      details: `受影响数据: ${failed.join("、")}。文件可能已损坏或被篡改。`,
      affectedCount: failed.length,
    });
  } else {
    issues.push({
      severity: "info",
      code: "CHECKSUM_OK",
      message: "所有数据块的校验和验证通过，文件完整性正常",
    });
  }
}

function validateStats(
  data: BackupData,
  stats: BackupStats | undefined,
  issues: ValidationIssue[]
): void {
  if (!stats || typeof stats !== "object") {
    issues.push({
      severity: "warning",
      code: "STATS_MISSING",
      message: "备份文件缺少统计信息",
    });
    return;
  }

  const actual = computeStats(data);
  const mismatch: string[] = [];
  for (const store of Object.keys(actual) as Array<keyof BackupStats>) {
    if (typeof actual[store] === "number" && typeof stats[store] === "number" && actual[store] !== stats[store]) {
      mismatch.push(`${STORE_LABELS[store] || store}(期望${stats[store]}，实际${actual[store]})`);
    }
  }
  if (mismatch.length > 0) {
    issues.push({
      severity: "warning",
      code: "STATS_MISMATCH",
      message: "统计信息与实际数据不一致",
      details: mismatch.join("；"),
    });
  }
}

function hasRequiredBackupDataShape(data: unknown): data is BackupData {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return (
    Array.isArray(record.caseRecords) &&
    Array.isArray(record.timeline) &&
    Array.isArray(record.riskAssessments) &&
    Array.isArray(record.goals) &&
    Array.isArray(record.crisisWarnings) &&
    typeof record.meta === "object" &&
    record.meta !== null &&
    Array.isArray(record.auditLogs)
  );
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

  if (!structureValid || !versionCompatible) {
    return { valid: false, issues, structureValid, versionCompatible, sensitiveFields: [] };
  }

  const data = obj.data as Record<string, unknown>;

  const requiredStores = ["caseRecords", "timeline", "riskAssessments", "goals", "crisisWarnings", "meta", "auditLogs"];
  for (const store of requiredStores) {
    if (!(store in data)) {
      issues.push({
        severity: "error",
        code: `MISSING_${store.toUpperCase()}`,
        message: `备份文件中缺少 ${STORE_LABELS[store] || store} 数据，无法导入`,
        affectedStore: store,
      });
      structureValid = false;
    }
  }

  validateMeta(data.meta, issues);

  const storeEntries = Object.entries(STORE_SCHEMAS) as Array<[keyof BackupData, StoreSchema]>;
  for (const [storeName, schema] of storeEntries) {
    const storeData = data[storeName];
    if (storeData !== undefined) {
      validateStore(storeData, storeName, schema, issues);
    }
  }

  if (!hasRequiredBackupDataShape(data)) {
    return { valid: false, issues, structureValid: false, versionCompatible, sensitiveFields };
  }

  const backup = obj as BackupFile;
  if (backup.data && typeof backup.data === "object") {
    validateChecksums(data, backup.checksums, issues);
    validateStats(data, backup.stats, issues);
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

export function prepareImportDataByMode(
  backup: BackupFile,
  preview: ImportPreview,
  mode: ImportMode
): {
  dataToImport: BackupData;
  skippedIds: Map<string, string[]>;
  description: string;
} {
  const skippedIds = new Map<string, string[]>();
  const conflictIdsByStore = new Map<string, Set<string>>();

  for (const conflict of preview.conflicts) {
    const storeKey = conflict.store;
    if (!conflictIdsByStore.has(storeKey)) {
      conflictIdsByStore.set(storeKey, new Set());
    }
    conflictIdsByStore.get(storeKey)!.add(conflict.id);
  }

  const filterByStore = <T extends { id: string }>(
    items: T[],
    storeLabel: string,
    shouldSkip: boolean
  ): T[] => {
    if (!shouldSkip) return items;
    const conflictIds = conflictIdsByStore.get(storeLabel) || new Set();
    const skipped: string[] = [];
    const filtered = items.filter(item => {
      if (conflictIds.has(item.id)) {
        skipped.push(item.id);
        return false;
      }
      return true;
    });
    if (skipped.length > 0) {
      skippedIds.set(storeLabel, skipped);
    }
    return filtered;
  };

  let description = "";
  let caseRecords = backup.data.caseRecords;
  let timeline = backup.data.timeline;
  let riskAssessments = backup.data.riskAssessments;
  let goals = backup.data.goals;
  let crisisWarnings = backup.data.crisisWarnings;

  if (mode === "merge") {
    description = "合并模式：保留当前数据，新增备份独有记录，更新冲突记录";
  } else if (mode === "overwrite") {
    description = "覆盖模式：删除所有当前数据，完全替换为备份数据";
  } else if (mode === "skip") {
    description = "跳过模式：仅导入备份独有记录，冲突时保留当前数据";
    caseRecords = filterByStore(caseRecords, "个案记录", true);
    timeline = filterByStore(timeline, "会谈时间线", true);
    riskAssessments = filterByStore(riskAssessments, "风险评估", true);
    goals = filterByStore(goals, "干预目标", true);
    crisisWarnings = filterByStore(crisisWarnings, "危机预警", true);
  }

  return {
    dataToImport: {
      ...backup.data,
      caseRecords,
      timeline,
      riskAssessments,
      goals,
      crisisWarnings,
    },
    skippedIds,
    description,
  };
}

export { AUDIT_STORAGE_KEY };
