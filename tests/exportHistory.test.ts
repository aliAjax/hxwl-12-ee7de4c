import { describe, it, expect, beforeEach } from "vitest";
import {
  getFilteredExportHistory,
  getExportHistoryStats,
  getAllExportHistory,
  deleteExportHistoryEntry,
  clearExportHistory,
  getExportHistoryById,
  createExportHistory,
  type ExportHistoryEntry,
  type ExportActionType,
} from "../src/utils/exportHistory";

function createEntry(overrides: Partial<ExportHistoryEntry> = {}): ExportHistoryEntry {
  return {
    id: `eh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    operatorRole: "counselor",
    operatorName: "李咨询师",
    actionType: "generate",
    scopeKey: "counselor_summary",
    scopeLabel: "咨询摘要",
    desensitized: true,
    includes: ["基本主题", "关键干预"],
    recordCount: 3,
    snapshot: "report content sample",
    ...overrides,
  };
}

describe("getFilteredExportHistory 过滤函数", () => {
  beforeEach(() => {
    clearExportHistory();
  });

  it("无过滤条件应返回全部记录", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "test",
      scopeLabel: "测试",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "admin",
      actionType: "download",
      scopeKey: "test2",
      scopeLabel: "测试2",
      desensitized: false,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });

    const result = getFilteredExportHistory({});
    expect(result).toHaveLength(2);
  });

  it("按 operatorRole 过滤", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "a",
      scopeLabel: "A",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "a2",
      scopeLabel: "A2",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "admin",
      actionType: "generate",
      scopeKey: "b",
      scopeLabel: "B",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });

    const result = getFilteredExportHistory({ operatorRole: "counselor" });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.operatorRole === "counselor")).toBe(true);
  });

  it("按 scopeKey 过滤", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "scope_1",
      scopeLabel: "S1",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "scope_2",
      scopeLabel: "S2",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });

    const result = getFilteredExportHistory({ scopeKey: "scope_1" });
    expect(result).toHaveLength(1);
    expect(result[0].scopeKey).toBe("scope_1");
  });

  it("按 actionType 过滤", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "counselor",
      actionType: "download",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "counselor",
      actionType: "copy",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });

    const result = getFilteredExportHistory({ actionType: "download" });
    expect(result).toHaveLength(1);
    expect(result[0].actionType).toBe("download");
  });

  it("按 desensitized 过滤", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s1",
      scopeLabel: "S1",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "admin",
      actionType: "generate",
      scopeKey: "s2",
      scopeLabel: "S2",
      desensitized: false,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });

    const sensitive = getFilteredExportHistory({ desensitized: false });
    expect(sensitive).toHaveLength(1);
    expect(sensitive[0].desensitized).toBe(false);

    const masked = getFilteredExportHistory({ desensitized: true });
    expect(masked).toHaveLength(1);
    expect(masked[0].desensitized).toBe(true);
  });

  it("按 targetClientCode 过滤", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
      targetClientCode: "C-001",
    });
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
      targetClientCode: "C-002",
    });

    const result = getFilteredExportHistory({ targetClientCode: "C-001" });
    expect(result).toHaveLength(1);
    expect(result[0].targetClientCode).toBe("C-001");
  });

  it("按日期范围过滤", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
      dateRange: {},
    });
    localStorage.getItem;
    const entries = getAllExportHistory();
    entries[0].timestamp = "2026-06-01T10:00:00Z";
    localStorage.setItem("hxwl12_export_history", JSON.stringify(entries));

    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s2",
      scopeLabel: "S2",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });

    const result = getFilteredExportHistory({
      startDate: "2026-06-10",
      endDate: "2026-06-30",
    });
    expect(result).toHaveLength(1);
  });
});

describe("getExportHistoryStats 统计函数", () => {
  beforeEach(() => {
    clearExportHistory();
  });

  it("空数据应返回零统计", () => {
    const stats = getExportHistoryStats();
    expect(stats.total).toBe(0);
    expect(stats.byActionType.generate).toBe(0);
    expect(stats.byActionType.copy).toBe(0);
    expect(stats.byActionType.download).toBe(0);
    expect(stats.byRole.counselor).toBe(0);
    expect(stats.byRole.supervisor).toBe(0);
    expect(stats.byRole.admin).toBe(0);
  });

  it("应正确统计各维度数量", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s1",
      scopeLabel: "S1",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "counselor",
      actionType: "download",
      scopeKey: "s2",
      scopeLabel: "S2",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "admin",
      actionType: "copy",
      scopeKey: "s3",
      scopeLabel: "S3",
      desensitized: false,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });

    const stats = getExportHistoryStats();
    expect(stats.total).toBe(3);
    expect(stats.byActionType.generate).toBe(1);
    expect(stats.byActionType.download).toBe(1);
    expect(stats.byActionType.copy).toBe(1);
    expect(stats.byRole.counselor).toBe(2);
    expect(stats.byRole.admin).toBe(1);
    expect(stats.byRole.supervisor).toBe(0);
  });
});

describe("CRUD 操作", () => {
  beforeEach(() => {
    clearExportHistory();
  });

  it("createExportHistory 应返回带 ID 和时间戳的记录", () => {
    const entry = createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "test content",
    });
    expect(entry.id).toMatch(/^eh_/);
    expect(entry.timestamp).toBeTruthy();
    expect(entry.operatorName).toBeTruthy();
  });

  it("getExportHistoryById 应按 ID 查找", () => {
    const created = createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    const found = getExportHistoryById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it("getExportHistoryById 对不存在 ID 返回 undefined", () => {
    expect(getExportHistoryById("nonexistent")).toBeUndefined();
  });

  it("deleteExportHistoryEntry 应按 ID 删除", () => {
    const created = createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s",
      scopeLabel: "S",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    expect(getAllExportHistory()).toHaveLength(1);

    const result = deleteExportHistoryEntry(created.id);
    expect(result).toBe(true);
    expect(getAllExportHistory()).toHaveLength(0);
  });

  it("deleteExportHistoryEntry 对不存在 ID 返回 false", () => {
    const result = deleteExportHistoryEntry("nonexistent");
    expect(result).toBe(false);
  });

  it("clearExportHistory 应清空所有记录并返回清除数量", () => {
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s1",
      scopeLabel: "S1",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });
    createExportHistory({
      operatorRole: "counselor",
      actionType: "generate",
      scopeKey: "s2",
      scopeLabel: "S2",
      desensitized: true,
      includes: [],
      recordCount: 1,
      snapshot: "",
    });

    const count = clearExportHistory();
    expect(count).toBe(2);
    expect(getAllExportHistory()).toHaveLength(0);
  });
});
