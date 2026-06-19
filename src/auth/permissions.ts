import {
  type UserRole,
  type PermissionAction,
  type FieldKey,
  type MenuKey,
  ROLE_CONFIG,
  ROLE_LABELS,
} from "./roleConfig";

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermission?: PermissionAction;
}

export function hasPermission(
  role: UserRole | undefined | null,
  action: PermissionAction
): PermissionCheckResult {
  if (!role) {
    return { allowed: false, reason: "未登录或角色未定义", requiredPermission: action };
  }

  const config = ROLE_CONFIG[role];
  if (!config) {
    return { allowed: false, reason: `未知角色: ${role}`, requiredPermission: action };
  }

  const allowed = config.permissions.includes(action);
  return {
    allowed,
    reason: allowed ? undefined : `角色「${ROLE_LABELS[role]}」无权限执行此操作`,
    requiredPermission: action,
  };
}

export function assertPermission(
  role: UserRole | undefined | null,
  action: PermissionAction,
  context?: string
): void {
  const result = hasPermission(role, action);
  if (!result.allowed) {
    const ctx = context ? ` [${context}]` : "";
    const error = new Error(`权限拒绝${ctx}: ${result.reason}`);
    error.name = "PermissionDeniedError";
    console.warn("[权限校验失败]", {
      role,
      action,
      context,
      reason: result.reason,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

export function withPermissionGuard<Args extends unknown[], R>(
  role: UserRole | undefined | null,
  action: PermissionAction,
  fn: (...args: Args) => R,
  context?: string
): (...args: Args) => R {
  return (...args: Args): R => {
    assertPermission(role, action, context);
    return fn(...args);
  };
}

export function canViewField(
  role: UserRole | undefined | null,
  field: FieldKey
): boolean {
  if (!role) return false;
  const config = ROLE_CONFIG[role];
  if (!config) return false;
  return config.visibleFields.includes(field);
}

export function canViewMenu(
  role: UserRole | undefined | null,
  menu: MenuKey
): boolean {
  if (!role) return false;
  const config = ROLE_CONFIG[role];
  if (!config) return false;
  return config.visibleMenus.includes(menu);
}

export function getVisibleFields(role: UserRole | undefined | null): FieldKey[] {
  if (!role) return [];
  const config = ROLE_CONFIG[role];
  return config?.visibleFields ?? [];
}

export function getVisibleMenus(role: UserRole | undefined | null): MenuKey[] {
  if (!role) return [];
  const config = ROLE_CONFIG[role];
  return config?.visibleMenus ?? [];
}

export function getExportScopes(role: UserRole | undefined | null) {
  if (!role) return [];
  const config = ROLE_CONFIG[role];
  return config?.exportScopes ?? [];
}

export type BatchPermissionResult = Record<PermissionAction, boolean>;

export function checkBatchPermissions(
  role: UserRole | undefined | null,
  actions: PermissionAction[]
): BatchPermissionResult {
  const result = {} as BatchPermissionResult;
  actions.forEach(action => {
    result[action] = hasPermission(role, action).allowed;
  });
  return result;
}

export class PermissionGuard {
  private role: UserRole | null = null;

  setRole(role: UserRole | null) {
    this.role = role;
  }

  has(action: PermissionAction): boolean {
    return hasPermission(this.role, action).allowed;
  }

  assert(action: PermissionAction, context?: string): void {
    assertPermission(this.role, action, context);
  }

  wrap<Args extends unknown[], R>(
    action: PermissionAction,
    fn: (...args: Args) => R,
    context?: string
  ): (...args: Args) => R {
    return withPermissionGuard(this.role, action, fn, context);
  }

  canView(field: FieldKey): boolean {
    return canViewField(this.role, field);
  }
}

export const permissionGuard = new PermissionGuard();
