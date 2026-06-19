import {
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  cloneElement,
  isValidElement,
  type ComponentType,
} from "react";
import { useAuth } from "./AuthContext";
import type { PermissionAction, FieldKey, MenuKey, ExportScope } from "./roleConfig";
import { createAuditLog } from "./auditLog";

export interface PermissionGateProps {
  action: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
  showDeniedIndicator?: boolean;
  onDenied?: () => void;
}

export function PermissionGate({
  action,
  children,
  fallback = null,
  showDeniedIndicator = false,
  onDenied,
}: PermissionGateProps) {
  const { hasPermission, currentRole } = useAuth();
  const allowed = hasPermission(action);

  if (allowed) {
    return <>{children}</>;
  }

  if (showDeniedIndicator) {
    return (
      <span
        className="permission-denied-indicator"
        onClick={() => {
          onDenied?.();
          createAuditLog({
            actorRole: currentRole,
            action: "view",
            targetType: "system",
            status: "denied",
            permissionChecked: action,
            message: `尝试访问被拒绝的功能: ${action}`,
          });
        }}
        title="暂无权限访问此功能"
      >
        <span className="lock-icon">🔒</span>
        <span className="denied-text">权限不足</span>
      </span>
    );
  }

  return <>{fallback}</>;
}

export interface ProtectedButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  action: PermissionAction;
  onClick?: () => void;
  showIfDenied?: boolean;
  auditOnClick?: {
    targetType: Parameters<typeof createAuditLog>[0]["targetType"];
    targetId?: string;
    targetLabel?: string;
    details?: Record<string, unknown>;
  };
}

export function ProtectedButton({
  action,
  onClick,
  showIfDenied = false,
  auditOnClick,
  disabled,
  className,
  children,
  ...restProps
}: ProtectedButtonProps) {
  const { hasPermission, assertPermission, currentRole } = useAuth();
  const allowed = hasPermission(action);
  const [deniedNotice, setDeniedNotice] = useState(false);

  const handleClick = () => {
    try {
      assertPermission(action);
      if (auditOnClick) {
        createAuditLog({
          actorRole: currentRole,
          action: action.startsWith("export")
            ? "export"
            : action.startsWith("delete")
            ? "delete"
            : action.startsWith("create")
            ? "create"
            : action.startsWith("edit") || action.startsWith("update")
            ? "update"
            : action === "supervision.feedback"
            ? "feedback"
            : action === "supervision.submit"
            ? "submit"
            : "view",
          targetType: auditOnClick.targetType,
          targetId: auditOnClick.targetId,
          targetLabel: auditOnClick.targetLabel,
          permissionChecked: action,
          status: "success",
          details: auditOnClick.details,
        });
      }
      onClick?.();
    } catch (e) {
      console.warn("[ProtectedButton] 权限校验失败:", e);
      setDeniedNotice(true);
      setTimeout(() => setDeniedNotice(false), 2000);
      createAuditLog({
        actorRole: currentRole,
        action: action.startsWith("export")
          ? "export"
          : action.startsWith("delete")
          ? "delete"
          : action.startsWith("create")
          ? "create"
          : action.startsWith("edit") || action.startsWith("update")
          ? "update"
          : action === "supervision.feedback"
          ? "feedback"
          : action === "supervision.submit"
          ? "submit"
          : "view",
        targetType: auditOnClick?.targetType || "system",
        status: "denied",
        permissionChecked: action,
        message: `按钮越权点击被拦截: ${action}`,
      });
    }
  };

  if (!allowed && !showIfDenied) {
    return null;
  }

  const isDisabled = disabled || !allowed;

  return (
    <>
      <button
        {...restProps}
        onClick={handleClick}
        disabled={isDisabled}
        className={`${className || ""} ${!allowed ? "btn-permission-denied" : ""}`}
      >
        {!allowed && <span className="lock-icon">🔒 </span>}
        {children}
      </button>
      {deniedNotice && (
        <span className="permission-denied-toast">
          ⚠ 权限不足，此操作已被拦截
        </span>
      )}
    </>
  );
}

export interface ProtectedFieldProps {
  field: FieldKey;
  label: ReactNode;
  children: ReactNode;
  fallback?: ReactNode;
  desensitize?: boolean;
}

export function ProtectedField({
  field,
  label,
  children,
  fallback = null,
  desensitize = false,
}: ProtectedFieldProps) {
  const { canViewField } = useAuth();
  const visible = canViewField(field);

  if (!visible) {
    return <>{fallback}</>;
  }

  return (
    <div className={`protected-field ${desensitize ? "desensitized" : ""}`}>
      {label && <div className="protected-field-label">{label}</div>}
      <div className="protected-field-content">{children}</div>
    </div>
  );
}

export interface ProtectedMenuProps {
  menu: MenuKey;
  children: ReactNode;
  fallback?: ReactNode;
}

export function ProtectedMenu({
  menu,
  children,
  fallback = null,
}: ProtectedMenuProps) {
  const { canViewMenu } = useAuth();
  const visible = canViewMenu(menu);

  if (!visible) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export interface ProtectedExportProps {
  exportScopeKey: string;
  children: ReactNode;
  onExport: () => void;
  targetType: Parameters<typeof createAuditLog>[0]["targetType"];
  targetLabel?: string;
}

export function ProtectedExport({
  children,
  onExport,
  targetType,
  targetLabel,
}: ProtectedExportProps) {
  const { hasPermission, assertPermission, currentRole, getExportScopes } = useAuth();
  const scopes = getExportScopes();
  const hasExportPerm = hasPermission("export.summary") || hasPermission("export.full");

  const handleExport = () => {
    try {
      if (!hasPermission("export.summary") && !hasPermission("export.full")) {
        assertPermission("export.summary");
      }
      createAuditLog({
        actorRole: currentRole,
        action: "export",
        targetType,
        targetLabel: targetLabel || "数据导出",
        permissionChecked: "export.summary",
        status: "success",
        details: { availableScopes: scopes.map((s: ExportScope) => s.key) },
      });
      onExport();
    } catch (e) {
      createAuditLog({
        actorRole: currentRole,
        action: "export",
        targetType,
        status: "denied",
        permissionChecked: "export.summary",
        message: `导出操作被拒绝`,
      });
    }
  };

  if (!hasExportPerm) {
    return null;
  }

  if (isValidElement(children)) {
    return cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: handleExport,
    });
  }

  return <>{children}</>;
}

export interface WithPermissionOptions {
  action: PermissionAction;
  fallback?: ReactNode;
}

export function withPermission<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: WithPermissionOptions
) {
  const { action, fallback = null } = options;
  return function WithPermissionWrapper(props: P) {
    const { hasPermission } = useAuth();
    const allowed = hasPermission(action);

    if (!allowed) {
      return <>{fallback}</>;
    }

    return <WrappedComponent {...props} />;
  };
}

export function useProtectedAction<T extends (...args: unknown[]) => R, R>(
  action: PermissionAction,
  fn: T,
  auditInfo?: {
    targetType: Parameters<typeof createAuditLog>[0]["targetType"];
    targetId?: string;
    targetLabel?: string;
    getDetails?: (...args: Parameters<T>) => Record<string, unknown>;
    getMessage?: (...args: Parameters<T>) => string;
    auditAction?: Parameters<typeof createAuditLog>[0]["action"];
  }
): T {
  const { assertPermission, currentRole } = useAuth();

  return ((...args: Parameters<T>): R => {
    assertPermission(action);

    if (auditInfo) {
      createAuditLog({
        actorRole: currentRole,
        action: auditInfo.auditAction || (
          action.startsWith("export") ? "export" :
          action.startsWith("delete") ? "delete" :
          action.startsWith("create") ? "create" :
          action.startsWith("edit") || action.startsWith("update") ? "update" :
          action === "supervision.feedback" ? "feedback" :
          action === "supervision.submit" ? "submit" : "view"
        ),
        targetType: auditInfo.targetType,
        targetId: auditInfo.targetId,
        targetLabel: auditInfo.targetLabel,
        permissionChecked: action,
        status: "success",
        details: auditInfo.getDetails ? auditInfo.getDetails(...args) : undefined,
        message: auditInfo.getMessage ? auditInfo.getMessage(...args) : undefined,
      });
    }

    return fn(...args);
  }) as T;
}

export function RoleBasedView({
  views,
}: {
  views: Partial<Record<import("./roleConfig").UserRole, ReactNode>>;
}) {
  const { currentRole } = useAuth();
  return <>{views[currentRole] ?? null}</>;
}
