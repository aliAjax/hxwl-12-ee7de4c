import { describe, it, expect, beforeEach } from "vitest";
import {
  getFilteredAuditLogs,
  getAuditLogStats,
  mergeAuditLogs,
  replaceAllAuditLogs,
  snapshotAuditLogs,
  restoreAuditLogsFromSnapshot,
  STORAGE_KEY,
  type AuditLogEntry,
  type AuditActionType,
  type AuditTargetType,
} from "../src/auth/auditLog";
import type { UserRole } from "../src/auth/roleConfig";

function createLog(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actorRole: "counselor",
    actorName: "李咨询师",
    action: "create",
    targetType: "case_record",
    status: "success",
    ...overrides,
  };
}

describe("getFilteredAuditLogs 过滤函数", () => {
  beforeEach(() => {
    replaceAllAuditLogs([]);
  });

  it("无过滤条件应返回全部日志", () => {
    const logs = [
      createLog({ id: "1", action: "create" }),
      createLog({ id: "2", action: "update" }),
      createLog({ id: "3", action: "delete" }),
    ];
    replaceAllAuditLogs(logs);
    const result = getFilteredAuditLogs({});
    expect(result).toHaveLength(3);
  });

  it("按角色过滤应只返回匹配角色的日志", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", actorRole: "counselor" }),
      createLog({ id: "2", actorRole: "supervisor" }),
      createLog({ id: "3", actorRole: "admin" }),
      createLog({ id: "4", actorRole: "counselor" }),
    ];
    replaceAllAuditLogs(logs);

    const result = getFilteredAuditLogs({ actorRole: "counselor" });
    expect(result).toHaveLength(2);
    expect(result.every(l => l.actorRole === "counselor")).toBe(true);
  });

  it("按 action 过滤应只返回匹配操作", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", action: "create" }),
      createLog({ id: "2", action: "update" }),
      createLog({ id: "3", action: "create" }),
    ];
    replaceAllAuditLogs(logs);

    const result = getFilteredAuditLogs({ action: "create" });
    expect(result).toHaveLength(2);
    expect(result.every(l => l.action === "create")).toBe(true);
  });

  it("按 targetType 过滤应只返回匹配目标类型", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", targetType: "case_record" }),
      createLog({ id: "2", targetType: "risk_assessment" }),
      createLog({ id: "3", targetType: "case_record" }),
    ];
    replaceAllAuditLogs(logs);

    const result = getFilteredAuditLogs({ targetType: "case_record" });
    expect(result).toHaveLength(2);
    expect(result.every(l => l.targetType === "case_record")).toBe(true);
  });

  it("按 status 过滤应只返回匹配状态", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", status: "success" }),
      createLog({ id: "2", status: "denied" }),
      createLog({ id: "3", status: "failed" }),
    ];
    replaceAllAuditLogs(logs);

    const denied = getFilteredAuditLogs({ status: "denied" });
    expect(denied).toHaveLength(1);
    expect(denied[0].status).toBe("denied");
  });

  it("按日期范围过滤应只返回范围内日志", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", timestamp: "2026-06-01T10:00:00Z" }),
      createLog({ id: "2", timestamp: "2026-06-15T10:00:00Z" }),
      createLog({ id: "3", timestamp: "2026-06-20T10:00:00Z" }),
    ];
    replaceAllAuditLogs(logs);

    const result = getFilteredAuditLogs({
      startDate: "2026-06-10",
      endDate: "2026-06-19",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("按关键词过滤应在 actorName/targetLabel/message 中搜索", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", actorName: "王督导", targetLabel: "张三的记录" }),
      createLog({ id: "2", targetLabel: "普通记录", message: "删除C-001的数据" }),
      createLog({ id: "3", actorName: "李咨询师", message: "正常操作" }),
    ];
    replaceAllAuditLogs(logs);

    const result1 = getFilteredAuditLogs({ keyword: "督导" });
    expect(result1).toHaveLength(1);
    expect(result1[0].id).toBe("1");

    const result2 = getFilteredAuditLogs({ keyword: "C-001" });
    expect(result2).toHaveLength(1);
    expect(result2[0].id).toBe("2");
  });

  it("多条件组合过滤应同时满足所有条件", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", actorRole: "counselor", action: "create", status: "success" }),
      createLog({ id: "2", actorRole: "counselor", action: "delete", status: "denied" }),
      createLog({ id: "3", actorRole: "admin", action: "delete", status: "success" }),
    ];
    replaceAllAuditLogs(logs);

    const result = getFilteredAuditLogs({
      actorRole: "counselor",
      action: "delete",
      status: "denied",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });
});

describe("getAuditLogStats 统计函数", () => {
  beforeEach(() => {
    replaceAllAuditLogs([]);
  });

  it("空日志应返回零统计", () => {
    const stats = getAuditLogStats();
    expect(stats.total).toBe(0);
    expect(stats.byRole.counselor).toBe(0);
    expect(stats.byRole.supervisor).toBe(0);
    expect(stats.byRole.admin).toBe(0);
    expect(stats.byStatus.success).toBe(0);
    expect(stats.last7Days).toHaveLength(7);
    expect(stats.last7Days.every(d => d.count === 0)).toBe(true);
  });

  it("应正确按角色统计", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", actorRole: "counselor" }),
      createLog({ id: "2", actorRole: "counselor" }),
      createLog({ id: "3", actorRole: "admin" }),
    ];
    replaceAllAuditLogs(logs);

    const stats = getAuditLogStats();
    expect(stats.byRole.counselor).toBe(2);
    expect(stats.byRole.admin).toBe(1);
    expect(stats.byRole.supervisor).toBe(0);
  });

  it("应正确按操作类型统计", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", action: "create" }),
      createLog({ id: "2", action: "create" }),
      createLog({ id: "3", action: "update" }),
      createLog({ id: "4", action: "export" }),
    ];
    replaceAllAuditLogs(logs);

    const stats = getAuditLogStats();
    expect(stats.byAction.create).toBe(2);
    expect(stats.byAction.update).toBe(1);
    expect(stats.byAction.export).toBe(1);
    expect(stats.byAction.delete).toBe(0);
  });

  it("应正确按状态统计", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", status: "success" }),
      createLog({ id: "2", status: "success" }),
      createLog({ id: "3", status: "denied" }),
      createLog({ id: "4", status: "failed" }),
    ];
    replaceAllAuditLogs(logs);

    const stats = getAuditLogStats();
    expect(stats.byStatus.success).toBe(2);
    expect(stats.byStatus.denied).toBe(1);
    expect(stats.byStatus.failed).toBe(1);
  });

  it("last7Days 应返回最近7天且格式正确", () => {
    const stats = getAuditLogStats();
    expect(stats.last7Days).toHaveLength(7);
    stats.last7Days.forEach(d => {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof d.count).toBe("number");
    });
  });

  it("total 应等于各角色统计之和", () => {
    const logs: AuditLogEntry[] = [
      createLog({ id: "1", actorRole: "counselor" }),
      createLog({ id: "2", actorRole: "supervisor" }),
      createLog({ id: "3", actorRole: "admin" }),
    ];
    replaceAllAuditLogs(logs);

    const stats = getAuditLogStats();
    const roleSum = stats.byRole.counselor + stats.byRole.supervisor + stats.byRole.admin;
    expect(roleSum).toBe(stats.total);
  });
});

describe("mergeAuditLogs 合并函数", () => {
  beforeEach(() => {
    replaceAllAuditLogs([]);
  });

  it("合并全新日志应全部添加", () => {
    replaceAllAuditLogs([
      createLog({ id: "existing_1" }),
    ]);

    const newLogs = [
      createLog({ id: "new_1", timestamp: "2026-06-20T10:00:00Z" }),
      createLog({ id: "new_2", timestamp: "2026-06-21T10:00:00Z" }),
    ];

    const result = mergeAuditLogs(newLogs);
    expect(result.added).toBe(2);
    expect(result.total).toBe(3);
  });

  it("合并重复 ID 的日志应只保留一份", () => {
    replaceAllAuditLogs([
      createLog({ id: "dup_1", timestamp: "2026-06-01T10:00:00Z" }),
    ]);

    const newLogs = [
      createLog({ id: "dup_1", timestamp: "2026-06-20T10:00:00Z" }),
      createLog({ id: "new_1" }),
    ];

    const result = mergeAuditLogs(newLogs);
    expect(result.added).toBe(1);
  });

  it("合并结果应按时间倒序排列", () => {
    replaceAllAuditLogs([
      createLog({ id: "e1", timestamp: "2026-06-01T10:00:00Z" }),
    ]);

    const newLogs = [
      createLog({ id: "n1", timestamp: "2026-06-15T10:00:00Z" }),
      createLog({ id: "n2", timestamp: "2026-06-20T10:00:00Z" }),
    ];

    mergeAuditLogs(newLogs);
    const all = getFilteredAuditLogs({});
    const timestamps = all.map(l => l.timestamp);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] <= timestamps[i - 1]).toBe(true);
    }
  });
});

describe("snapshotAuditLogs / restoreAuditLogsFromSnapshot", () => {
  beforeEach(() => {
    replaceAllAuditLogs([]);
  });

  it("快照应包含当前所有日志和正确的存储键", () => {
    const logs = [
      createLog({ id: "1" }),
      createLog({ id: "2" }),
    ];
    replaceAllAuditLogs(logs);

    const snapshot = snapshotAuditLogs();
    expect(snapshot.storageKey).toBe(STORAGE_KEY);
    expect(snapshot.logs).toHaveLength(2);
    expect(typeof snapshot.timestamp).toBe("number");
  });

  it("从快照恢复应正确还原日志", () => {
    replaceAllAuditLogs([createLog({ id: "original" })]);

    const snapshot = snapshotAuditLogs();
    replaceAllAuditLogs([createLog({ id: "replaced" })]);
    expect(getFilteredAuditLogs({})).toHaveLength(1);

    const restored = restoreAuditLogsFromSnapshot(snapshot);
    expect(restored).toBe(true);

    const logs = getFilteredAuditLogs({});
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe("original");
  });

  it("存储键不匹配应发出警告但仍尝试恢复", () => {
    const badSnapshot = {
      logs: [createLog({ id: "snap1" })],
      timestamp: Date.now(),
      storageKey: "WRONG_KEY",
    };
    const result = restoreAuditLogsFromSnapshot(badSnapshot);
    expect(result).toBe(true);
  });

  it("无效快照数据应返回 false", () => {
    const badSnapshot = {
      logs: "not an array" as unknown as AuditLogEntry[],
      timestamp: Date.now(),
      storageKey: STORAGE_KEY,
    };
    const result = restoreAuditLogsFromSnapshot(badSnapshot);
    expect(result).toBe(false);
  });
});
