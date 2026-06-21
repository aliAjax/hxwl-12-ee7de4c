import { describe, it, expect } from "vitest";
import {
  hasPermission,
  assertPermission,
  withPermissionGuard,
  canViewField,
  canViewMenu,
  getVisibleFields,
  getVisibleMenus,
  getExportScopes,
  checkBatchPermissions,
  PermissionGuard,
  permissionGuard,
} from "../src/auth/permissions";
import type { UserRole, PermissionAction, FieldKey, MenuKey } from "../src/auth/roleConfig";
import { ALL_ROLES } from "../src/auth/roleConfig";

describe("hasPermission 基础权限校验", () => {
  it("未定义角色应被拒绝", () => {
    const result = hasPermission(null, "case.view");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("未登录");
    expect(result.requiredPermission).toBe("case.view");
  });

  it("undefined 角色应被拒绝", () => {
    const result = hasPermission(undefined, "case.view");
    expect(result.allowed).toBe(false);
  });

  it("未知角色应被拒绝", () => {
    const result = hasPermission("unknown_role" as UserRole, "case.view");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("未知角色");
  });

  it("counselor 角色应拥有 case.view 权限", () => {
    const result = hasPermission("counselor", "case.view");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("counselor 角色不应拥有 audit.delete 权限", () => {
    const result = hasPermission("counselor", "audit.delete");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("无权限");
  });

  it("admin 角色应拥有 audit.delete 权限", () => {
    const result = hasPermission("admin", "audit.delete");
    expect(result.allowed).toBe(true);
  });

  it("supervisor 角色应拥有 supervision.feedback 权限", () => {
    const result = hasPermission("supervisor", "supervision.feedback");
    expect(result.allowed).toBe(true);
  });

  it("counselor 角色不应拥有 supervision.feedback 权限", () => {
    const result = hasPermission("counselor", "supervision.feedback");
    expect(result.allowed).toBe(false);
  });

  it("admin 角色应拥有 backup.import 权限", () => {
    const result = hasPermission("admin", "backup.import");
    expect(result.allowed).toBe(true);
  });

  it("counselor 和 supervisor 都不应拥有 backup.import 权限", () => {
    expect(hasPermission("counselor", "backup.import").allowed).toBe(false);
    expect(hasPermission("supervisor", "backup.import").allowed).toBe(false);
  });
});

describe("assertPermission 断言权限", () => {
  it("有权限时不应抛出异常", () => {
    expect(() => assertPermission("admin", "audit.delete")).not.toThrow();
  });

  it("无权限时应抛出 PermissionDeniedError", () => {
    expect(() => assertPermission("counselor", "audit.delete")).toThrow(/权限拒绝/);
  });

  it("无权限时异常应包含自定义上下文", () => {
    try {
      assertPermission("counselor", "audit.delete", "删除审计日志操作");
      expect.fail("应该抛出异常");
    } catch (e) {
      const err = e as Error;
      expect(err.message).toContain("删除审计日志操作");
      expect(err.name).toBe("PermissionDeniedError");
    }
  });
});

describe("withPermissionGuard 高阶函数权限守护", () => {
  const add = (a: number, b: number) => a + b;

  it("有权限时应正常执行函数并返回结果", () => {
    const guardedAdd = withPermissionGuard("counselor", "case.create", add);
    expect(guardedAdd(1, 2)).toBe(3);
  });

  it("无权限时应抛出异常且不执行函数", () => {
    let executed = false;
    const sideEffectFn = () => {
      executed = true;
      return "done";
    };
    const guarded = withPermissionGuard("counselor", "audit.delete", sideEffectFn);

    expect(() => guarded()).toThrow();
    expect(executed).toBe(false);
  });
});

describe("canViewField 字段可见性校验", () => {
  it("admin 角色不应看到任何业务字段（visibleFields 为空）", () => {
    expect(canViewField("admin", "case.mainConcern")).toBe(false);
    expect(canViewField("admin", "risk.dimensions")).toBe(false);
  });

  it("counselor 角色应能看到个案相关字段", () => {
    expect(canViewField("counselor", "case.mainConcern")).toBe(true);
    expect(canViewField("counselor", "case.intervention")).toBe(true);
    expect(canViewField("counselor", "case.clientCode")).toBe(true);
  });

  it("supervisor 角色应能看到风险评估维度", () => {
    expect(canViewField("supervisor", "risk.dimensions")).toBe(true);
    expect(canViewField("supervisor", "risk.summary")).toBe(true);
  });

  it("null 角色应看不到任何字段", () => {
    expect(canViewField(null, "case.clientCode")).toBe(false);
  });
});

describe("canViewMenu 菜单可见性校验", () => {
  it("counselor 角色应能看到个案和时间线菜单", () => {
    expect(canViewMenu("counselor", "menu.caseRecords")).toBe(true);
    expect(canViewMenu("counselor", "menu.timeline")).toBe(true);
  });

  it("counselor 角色不应看到数据总览菜单", () => {
    expect(canViewMenu("counselor", "menu.dataOverview")).toBe(false);
  });

  it("admin 角色应能看到数据总览菜单", () => {
    expect(canViewMenu("admin", "menu.dataOverview")).toBe(true);
  });

  it("admin 角色不应看到个案记录菜单", () => {
    expect(canViewMenu("admin", "menu.caseRecords")).toBe(false);
  });

  it("supervisor 角色应能看到审计日志菜单", () => {
    expect(canViewMenu("supervisor", "menu.auditLog")).toBe(true);
  });

  it("null 角色应看不到任何菜单", () => {
    expect(canViewMenu(null, "menu.caseRecords")).toBe(false);
  });
});

describe("getVisibleFields / getVisibleMenus / getExportScopes", () => {
  it("getVisibleFields 对 counselor 返回正确字段列表", () => {
    const fields = getVisibleFields("counselor");
    expect(fields.length).toBeGreaterThan(0);
    expect(fields).toContain("case.clientCode");
    expect(fields).toContain("case.mainConcern");
  });

  it("getVisibleFields 对 admin 返回空数组", () => {
    const fields = getVisibleFields("admin");
    expect(fields).toEqual([]);
  });

  it("getVisibleMenus 对 admin 返回正确菜单列表", () => {
    const menus = getVisibleMenus("admin");
    expect(menus).toContain("menu.dataOverview");
    expect(menus).toContain("menu.auditLog");
    expect(menus).not.toContain("menu.caseRecords");
  });

  it("getExportScopes 对 counselor 仅返回摘要范围", () => {
    const scopes = getExportScopes("counselor");
    expect(scopes.length).toBe(1);
    expect(scopes[0].key).toBe("counselor_summary");
    expect(scopes[0].desensitized).toBe(true);
  });

  it("getExportScopes 对 supervisor 返回两个范围", () => {
    const scopes = getExportScopes("supervisor");
    expect(scopes.length).toBe(2);
    expect(scopes.some(s => s.key === "supervisor_summary")).toBe(true);
    expect(scopes.some(s => s.key === "supervisor_full")).toBe(true);
  });

  it("getExportScopes 对 admin 包含汇总报表", () => {
    const scopes = getExportScopes("admin");
    expect(scopes.some(s => s.key === "admin_aggregate")).toBe(true);
    expect(scopes.some(s => s.key === "admin_full")).toBe(true);
  });

  it("getExportScopes 对 null 返回空数组", () => {
    expect(getExportScopes(null)).toEqual([]);
  });
});

describe("checkBatchPermissions 批量权限校验", () => {
  it("应正确返回每个权限的校验结果", () => {
    const actions: PermissionAction[] = ["case.view", "case.create", "audit.delete"];
    const result = checkBatchPermissions("counselor", actions);
    expect(result["case.view"]).toBe(true);
    expect(result["case.create"]).toBe(true);
    expect(result["audit.delete"]).toBe(false);
  });

  it("admin 应对系统级权限返回 true", () => {
    const actions: PermissionAction[] = ["audit.delete", "system.reset", "backup.import", "backup.export"];
    const result = checkBatchPermissions("admin", actions);
    expect(result["audit.delete"]).toBe(true);
    expect(result["system.reset"]).toBe(true);
    expect(result["backup.import"]).toBe(true);
    expect(result["backup.export"]).toBe(true);
  });
});

describe("PermissionGuard 类", () => {
  it("setRole 后 has 方法应返回正确结果", () => {
    const guard = new PermissionGuard();
    guard.setRole("counselor");
    expect(guard.has("case.create")).toBe(true);
    expect(guard.has("audit.delete")).toBe(false);

    guard.setRole("admin");
    expect(guard.has("audit.delete")).toBe(true);
  });

  it("assert 方法有权限时不抛异常，无权限时抛出", () => {
    const guard = new PermissionGuard();
    guard.setRole("admin");
    expect(() => guard.assert("audit.delete")).not.toThrow();

    guard.setRole("counselor");
    expect(() => guard.assert("audit.delete")).toThrow();
  });

  it("wrap 方法应返回带权限守护的函数", () => {
    const guard = new PermissionGuard();
    guard.setRole("counselor");
    const fn = (x: number) => x * 2;
    const guarded = guard.wrap("case.view", fn);
    expect(guarded(5)).toBe(10);
  });

  it("canView 方法应返回字段可见性", () => {
    const guard = new PermissionGuard();
    guard.setRole("admin");
    expect(guard.canView("case.mainConcern")).toBe(false);

    guard.setRole("counselor");
    expect(guard.canView("case.mainConcern")).toBe(true);
  });

  it("permissionGuard 单例初始状态应无角色", () => {
    expect(permissionGuard.has("case.view")).toBe(false);
  });
});

describe("角色权限边界完整性", () => {
  it("ALL_ROLES 应包含 counselor、supervisor、admin", () => {
    expect(ALL_ROLES).toEqual(["counselor", "supervisor", "admin"]);
  });

  it("counselor 不应拥有任何数据总览和备份权限", () => {
    const adminOnly: PermissionAction[] = [
      "data.overview", "audit.delete", "system.reset",
      "backup.export", "backup.import",
    ];
    for (const action of adminOnly) {
      expect(hasPermission("counselor", action).allowed).toBe(false);
    }
  });

  it("系统重置权限应仅 admin 拥有", () => {
    expect(hasPermission("counselor", "system.reset").allowed).toBe(false);
    expect(hasPermission("supervisor", "system.reset").allowed).toBe(false);
    expect(hasPermission("admin", "system.reset").allowed).toBe(true);
  });

  it("危机策略权限应仅 admin 拥有", () => {
    expect(hasPermission("counselor", "crisis.strategy").allowed).toBe(false);
    expect(hasPermission("supervisor", "crisis.strategy").allowed).toBe(false);
    expect(hasPermission("admin", "crisis.strategy").allowed).toBe(true);
  });
});
