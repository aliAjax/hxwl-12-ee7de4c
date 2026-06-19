import type { UserRole, PermissionAction } from "./roleConfig";
import { hasPermission } from "./permissions";

export type AuditActionType =
  | "create"
  | "update"
  | "delete"
  | "export"
  | "feedback"
  | "submit"
  | "login"
  | "role_change"
  | "system_reset"
  | "view";

export type AuditTargetType =
  | "case_record"
  | "timeline_record"
  | "risk_assessment"
  | "intervention_goal"
  | "supervision_record"
  | "supervision_feedback"
  | "crisis_warning"
  | "export_summary"
  | "system"
  | "audit_log"
  | "user_session";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorRole: UserRole;
  actorName: string;
  action: AuditActionType;
  targetType: AuditTargetType;
  targetId?: string;
  targetLabel?: string;
  permissionChecked?: PermissionAction;
  status: "success" | "denied" | "failed";
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  message?: string;
}

export interface AuditLogFilters {
  actorRole?: UserRole;
  action?: AuditActionType;
  targetType?: AuditTargetType;
  status?: AuditLogEntry["status"];
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

const STORAGE_KEY = "hxwl12_audit_logs";
const MAX_LOG_ENTRIES = 5000;

function generateId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStorage(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStorage(logs: AuditLogEntry[]): void {
  try {
    const trimmed = logs.slice(0, MAX_LOG_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error("[审计日志] 存储失败:", e);
  }
}

const listeners = new Set<(logs: AuditLogEntry[]) => void>();

function emitChange(): void {
  const logs = getStorage();
  listeners.forEach(fn => {
    try { fn(logs); } catch { /* ignore */ }
  });
}

export function addAuditLogListener(fn: (logs: AuditLogEntry[]) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface CreateAuditLogParams {
  actorRole: UserRole;
  actorName?: string;
  action: AuditActionType;
  targetType: AuditTargetType;
  targetId?: string;
  targetLabel?: string;
  permissionChecked?: PermissionAction;
  status?: AuditLogEntry["status"];
  details?: Record<string, unknown>;
  message?: string;
}

export function createAuditLog(params: CreateAuditLogParams): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    actorRole: params.actorRole,
    actorName: params.actorName || getDefaultActorName(params.actorRole),
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    targetLabel: params.targetLabel,
    permissionChecked: params.permissionChecked,
    status: params.status || "success",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    details: params.details,
    message: params.message,
  };

  const logs = getStorage();
  logs.unshift(entry);
  setStorage(logs);

  console.debug("[审计日志]", {
    action: entry.action,
    target: entry.targetType,
    role: entry.actorRole,
    status: entry.status,
    time: entry.timestamp,
  });

  emitChange();
  return entry;
}

function getDefaultActorName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    counselor: "李咨询师",
    supervisor: "王督导",
    admin: "系统管理员",
  };
  return names[role];
}

export function getAllAuditLogs(): AuditLogEntry[] {
  return getStorage();
}

export function getFilteredAuditLogs(filters: AuditLogFilters): AuditLogEntry[] {
  const logs = getStorage();
  return logs.filter(entry => {
    if (filters.actorRole && entry.actorRole !== filters.actorRole) return false;
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.targetType && entry.targetType !== filters.targetType) return false;
    if (filters.status && entry.status !== filters.status) return false;
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      if (new Date(entry.timestamp) < start) return false;
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      if (new Date(entry.timestamp) > end) return false;
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      const searchText = [
        entry.actorName,
        entry.targetLabel,
        entry.message,
        entry.targetId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchText.includes(kw)) return false;
    }
    return true;
  });
}

export function deleteAuditLog(
  id: string,
  operatorRole: UserRole
): { success: boolean; message: string } {
  const permCheck = hasPermission(operatorRole, "audit.delete");
  if (!permCheck.allowed) {
    createAuditLog({
      actorRole: operatorRole,
      action: "delete",
      targetType: "audit_log",
      targetId: id,
      status: "denied",
      permissionChecked: "audit.delete",
      message: "尝试删除审计日志被拒绝",
    });
    return {
      success: false,
      message: permCheck.reason || "无权限删除审计日志",
    };
  }

  const logs = getStorage();
  const target = logs.find(l => l.id === id);
  if (!target) {
    return { success: false, message: "审计日志不存在" };
  }

  const filtered = logs.filter(l => l.id !== id);
  setStorage(filtered);

  createAuditLog({
    actorRole: operatorRole,
    action: "delete",
    targetType: "audit_log",
    targetId: id,
    targetLabel: target.targetLabel || `记录 #${id}`,
    status: "success",
    permissionChecked: "audit.delete",
    details: { deletedTimestamp: target.timestamp, originalAction: target.action },
  });

  emitChange();
  return { success: true, message: "审计日志已删除" };
}

export function clearAllAuditLogs(
  operatorRole: UserRole
): { success: boolean; message: string } {
  const permCheck = hasPermission(operatorRole, "audit.delete");
  if (!permCheck.allowed) {
    createAuditLog({
      actorRole: operatorRole,
      action: "delete",
      targetType: "audit_log",
      status: "denied",
      permissionChecked: "audit.delete",
      message: "尝试清空审计日志被拒绝",
    });
    return {
      success: false,
      message: permCheck.reason || "无权限清空审计日志",
    };
  }

  const count = getStorage().length;
  setStorage([]);

  createAuditLog({
    actorRole: operatorRole,
    action: "delete",
    targetType: "audit_log",
    status: "success",
    permissionChecked: "audit.delete",
    details: { clearedCount: count },
    message: `已清空 ${count} 条审计日志`,
  });

  emitChange();
  return { success: true, message: `已清空 ${count} 条审计日志` };
}

export function getAuditLogStats(): {
  total: number;
  byRole: Record<UserRole, number>;
  byAction: Record<AuditActionType, number>;
  byStatus: Record<AuditLogEntry["status"], number>;
  last7Days: { date: string; count: number }[];
} {
  const logs = getStorage();
  const stats = {
    total: logs.length,
    byRole: { counselor: 0, supervisor: 0, admin: 0 } as Record<UserRole, number>,
    byAction: {
      create: 0, update: 0, delete: 0, export: 0, feedback: 0,
      submit: 0, login: 0, role_change: 0, system_reset: 0, view: 0,
    } as Record<AuditActionType, number>,
    byStatus: { success: 0, denied: 0, failed: 0 } as Record<AuditLogEntry["status"], number>,
    last7Days: [] as { date: string; count: number }[],
  };

  const dayMap = new Map<string, number>();
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, 0);
  }

  logs.forEach(entry => {
    stats.byRole[entry.actorRole]++;
    stats.byAction[entry.action]++;
    stats.byStatus[entry.status]++;
    const dayKey = entry.timestamp.slice(0, 10);
    if (dayMap.has(dayKey)) {
      dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1);
    }
  });

  stats.last7Days = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
  return stats;
}

export const AUDIT_ACTION_LABELS: Record<AuditActionType, string> = {
  create: "新增",
  update: "编辑",
  delete: "删除",
  export: "导出",
  feedback: "督导反馈",
  submit: "提交",
  login: "登录",
  role_change: "切换角色",
  system_reset: "系统重置",
  view: "查看",
};

export const AUDIT_TARGET_LABELS: Record<AuditTargetType, string> = {
  case_record: "个案记录",
  timeline_record: "会谈时间线",
  risk_assessment: "风险评估",
  intervention_goal: "干预目标",
  supervision_record: "督导申请",
  supervision_feedback: "督导反馈",
  crisis_warning: "危机预警",
  export_summary: "导出摘要",
  system: "系统",
  audit_log: "审计日志",
  user_session: "用户会话",
};

export const AUDIT_STATUS_LABELS: Record<AuditLogEntry["status"], { label: string; color: string }> = {
  success: { label: "成功", color: "#10b981" },
  denied: { label: "拒绝", color: "#ef4444" },
  failed: { label: "失败", color: "#f59e0b" },
};
