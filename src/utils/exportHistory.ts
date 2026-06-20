import type { UserRole } from "../auth/roleConfig";

export type ExportActionType = "generate" | "copy" | "download";

export interface ExportHistoryEntry {
  id: string;
  timestamp: string;
  operatorRole: UserRole;
  operatorName: string;
  actionType: ExportActionType;
  scopeKey: string;
  scopeLabel: string;
  desensitized: boolean;
  includes: string[];
  targetClientCode?: string;
  dateRange?: { start?: string; end?: string };
  recordCount: number;
  snapshot: string;
}

export interface ExportHistoryFilters {
  operatorRole?: UserRole;
  scopeKey?: string;
  targetClientCode?: string;
  startDate?: string;
  endDate?: string;
  actionType?: ExportActionType;
  desensitized?: boolean;
}

const STORAGE_KEY = "hxwl12_export_history";
const MAX_ENTRIES = 500;

function generateId(): string {
  return `eh_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStorage(): ExportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStorage(entries: ExportHistoryEntry[]): void {
  try {
    const trimmed = entries.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error("[导出历史] 存储失败:", e);
  }
}

const listeners = new Set<(entries: ExportHistoryEntry[]) => void>();

function emitChange(): void {
  const entries = getStorage();
  listeners.forEach((fn) => {
    try {
      fn(entries);
    } catch {}
  });
}

export function addExportHistoryListener(fn: (entries: ExportHistoryEntry[]) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface CreateExportHistoryParams {
  operatorRole: UserRole;
  operatorName?: string;
  actionType: ExportActionType;
  scopeKey: string;
  scopeLabel: string;
  desensitized: boolean;
  includes: string[];
  targetClientCode?: string;
  dateRange?: { start?: string; end?: string };
  recordCount: number;
  snapshot: string;
}

export function createExportHistory(params: CreateExportHistoryParams): ExportHistoryEntry {
  const entry: ExportHistoryEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    operatorRole: params.operatorRole,
    operatorName: params.operatorName || getDefaultActorName(params.operatorRole),
    actionType: params.actionType,
    scopeKey: params.scopeKey,
    scopeLabel: params.scopeLabel,
    desensitized: params.desensitized,
    includes: params.includes,
    targetClientCode: params.targetClientCode,
    dateRange: params.dateRange,
    recordCount: params.recordCount,
    snapshot: params.snapshot,
  };

  const entries = getStorage();
  entries.unshift(entry);
  setStorage(entries);
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

export function getAllExportHistory(): ExportHistoryEntry[] {
  return getStorage();
}

export function getFilteredExportHistory(filters: ExportHistoryFilters): ExportHistoryEntry[] {
  const entries = getStorage();
  return entries.filter((entry) => {
    if (filters.operatorRole && entry.operatorRole !== filters.operatorRole) return false;
    if (filters.scopeKey && entry.scopeKey !== filters.scopeKey) return false;
    if (filters.targetClientCode && entry.targetClientCode !== filters.targetClientCode) return false;
    if (filters.actionType && entry.actionType !== filters.actionType) return false;
    if (filters.desensitized !== undefined && entry.desensitized !== filters.desensitized) return false;
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
    return true;
  });
}

export function getExportHistoryById(id: string): ExportHistoryEntry | undefined {
  const entries = getStorage();
  return entries.find((e) => e.id === id);
}

export function deleteExportHistoryEntry(id: string): boolean {
  const entries = getStorage();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  setStorage(entries);
  emitChange();
  return true;
}

export function clearExportHistory(): number {
  const count = getStorage().length;
  setStorage([]);
  emitChange();
  return count;
}

export function getExportHistoryStats(): {
  total: number;
  byActionType: Record<ExportActionType, number>;
  byRole: Record<UserRole, number>;
} {
  const entries = getStorage();
  return {
    total: entries.length,
    byActionType: {
      generate: entries.filter((e) => e.actionType === "generate").length,
      copy: entries.filter((e) => e.actionType === "copy").length,
      download: entries.filter((e) => e.actionType === "download").length,
    },
    byRole: {
      counselor: entries.filter((e) => e.operatorRole === "counselor").length,
      supervisor: entries.filter((e) => e.operatorRole === "supervisor").length,
      admin: entries.filter((e) => e.operatorRole === "admin").length,
    },
  };
}

export const EXPORT_ACTION_LABELS: Record<ExportActionType, string> = {
  generate: "生成",
  copy: "复制",
  download: "下载",
};

export const EXPORT_ACTION_ICONS: Record<ExportActionType, string> = {
  generate: "📋",
  copy: "📋",
  download: "📥",
};
