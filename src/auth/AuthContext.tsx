import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  type UserRole,
  type PermissionAction,
  type FieldKey,
  type MenuKey,
  type ExportScope,
  ROLE_CONFIG,
  DEFAULT_ROLE,
  ROLE_LABELS,
} from "./roleConfig";
import {
  hasPermission,
  assertPermission,
  canViewField,
  canViewMenu,
  type PermissionCheckResult,
} from "./permissions";
import { createAuditLog } from "./auditLog";

const STORAGE_KEY = "hxwl12_current_role";

export interface UserSession {
  role: UserRole;
  userName: string;
  loginAt: string;
  sessionId: string;
}

export interface AuthContextValue {
  session: UserSession | null;
  currentRole: UserRole;
  isAuthenticated: boolean;
  login: (role: UserRole, userName?: string) => void;
  logout: () => void;
  switchRole: (role: UserRole, userName?: string) => void;
  hasPermission: (action: PermissionAction) => boolean;
  assertPermission: (action: PermissionAction, context?: string) => void;
  checkPermission: (action: PermissionAction) => PermissionCheckResult;
  canViewField: (field: FieldKey) => boolean;
  canViewMenu: (menu: MenuKey) => boolean;
  getRoleConfig: () => typeof ROLE_CONFIG[UserRole] | null;
  getExportScopes: () => ExportScope[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function loadStoredRole(): UserRole | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role: UserRole; userName: string; sessionId: string };
    if (!parsed || !parsed.role) return null;
    const validRoles: UserRole[] = ["counselor", "supervisor", "admin"];
    if (!validRoles.includes(parsed.role)) return null;
    return parsed.role;
  } catch {
    return null;
  }
}

function loadStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role: UserRole; userName: string; sessionId: string; loginAt: string };
    if (!parsed || !parsed.role) return null;
    const validRoles: UserRole[] = ["counselor", "supervisor", "admin"];
    if (!validRoles.includes(parsed.role)) return null;
    return {
      role: parsed.role,
      userName: parsed.userName || getDefaultUserName(parsed.role),
      loginAt: parsed.loginAt || new Date().toISOString(),
      sessionId: parsed.sessionId || generateSessionId(),
    };
  } catch {
    return null;
  }
}

function persistSession(session: UserSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      role: session.role,
      userName: session.userName,
      sessionId: session.sessionId,
      loginAt: session.loginAt,
    }));
  } catch (e) {
    console.error("[Auth] 持久化会话失败:", e);
  }
}

function clearPersistedSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

function getDefaultUserName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    counselor: "李咨询师",
    supervisor: "王督导",
    admin: "系统管理员",
  };
  return names[role];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(() => {
    const stored = loadStoredSession();
    if (stored) {
      return stored;
    }
    return null;
  });

  const [initialized, setInitialized] = useState(false);

  const currentRole = useMemo<UserRole>(() => {
    return session?.role ?? loadStoredRole() ?? DEFAULT_ROLE;
  }, [session]);

  useEffect(() => {
    if (!session) {
      const stored = loadStoredSession();
      if (stored) {
        setSession(stored);
        createAuditLog({
          actorRole: stored.role,
          actorName: stored.userName,
          action: "login",
          targetType: "user_session",
          targetId: stored.sessionId,
          status: "success",
          details: { restoredFrom: "localStorage" },
          message: `会话恢复：${ROLE_LABELS[stored.role]} - ${stored.userName}`,
        });
      } else {
        const defaultSession: UserSession = {
          role: DEFAULT_ROLE,
          userName: getDefaultUserName(DEFAULT_ROLE),
          loginAt: new Date().toISOString(),
          sessionId: generateSessionId(),
        };
        setSession(defaultSession);
        persistSession(defaultSession);
        createAuditLog({
          actorRole: defaultSession.role,
          actorName: defaultSession.userName,
          action: "login",
          targetType: "user_session",
          targetId: defaultSession.sessionId,
          status: "success",
          details: { defaultRole: true },
          message: `默认登录：${ROLE_LABELS[defaultSession.role]} - ${defaultSession.userName}`,
        });
      }
    }
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (session) {
      persistSession(session);
    }
  }, [session]);

  const login = useCallback((role: UserRole, userName?: string) => {
    const newSession: UserSession = {
      role,
      userName: userName || getDefaultUserName(role),
      loginAt: new Date().toISOString(),
      sessionId: generateSessionId(),
    };
    setSession(newSession);

    createAuditLog({
      actorRole: role,
      actorName: newSession.userName,
      action: "login",
      targetType: "user_session",
      targetId: newSession.sessionId,
      status: "success",
      details: { role, userName: newSession.userName },
      message: `登录系统：${ROLE_LABELS[role]} - ${newSession.userName}`,
    });
  }, []);

  const logout = useCallback(() => {
    if (session) {
      createAuditLog({
        actorRole: session.role,
        actorName: session.userName,
        action: "delete",
        targetType: "user_session",
        targetId: session.sessionId,
        status: "success",
        message: `登出系统：${ROLE_LABELS[session.role]} - ${session.userName}`,
      });
    }
    setSession(null);
    clearPersistedSession();
  }, [session]);

  const switchRole = useCallback((role: UserRole, userName?: string) => {
    const oldRole = session?.role;
    const oldUserName = session?.userName;
    const newSession: UserSession = {
      role,
      userName: userName || getDefaultUserName(role),
      loginAt: session?.loginAt || new Date().toISOString(),
      sessionId: session?.sessionId || generateSessionId(),
    };
    setSession(newSession);

    createAuditLog({
      actorRole: role,
      actorName: newSession.userName,
      action: "role_change",
      targetType: "user_session",
      targetId: newSession.sessionId,
      status: "success",
      details: {
        fromRole: oldRole,
        toRole: role,
        fromUserName: oldUserName,
        toUserName: newSession.userName,
      },
      message: `切换角色：${oldRole ? ROLE_LABELS[oldRole] : '未登录'} → ${ROLE_LABELS[role]}`,
    });
  }, [session]);

  const checkPermissionFn = useCallback((action: PermissionAction): PermissionCheckResult => {
    return hasPermission(currentRole, action);
  }, [currentRole]);

  const hasPermissionFn = useCallback((action: PermissionAction): boolean => {
    return hasPermission(currentRole, action).allowed;
  }, [currentRole]);

  const assertPermissionFn = useCallback((action: PermissionAction, context?: string): void => {
    assertPermission(currentRole, action, context);
  }, [currentRole]);

  const canViewFieldFn = useCallback((field: FieldKey): boolean => {
    return canViewField(currentRole, field);
  }, [currentRole]);

  const canViewMenuFn = useCallback((menu: MenuKey): boolean => {
    return canViewMenu(currentRole, menu);
  }, [currentRole]);

  const getRoleConfig = useCallback(() => {
    if (!currentRole) return null;
    return ROLE_CONFIG[currentRole] || null;
  }, [currentRole]);

  const getExportScopes = useCallback((): ExportScope[] => {
    if (!currentRole) return [];
    return ROLE_CONFIG[currentRole]?.exportScopes || [];
  }, [currentRole]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    currentRole,
    isAuthenticated: !!session,
    login,
    logout,
    switchRole,
    hasPermission: hasPermissionFn,
    assertPermission: assertPermissionFn,
    checkPermission: checkPermissionFn,
    canViewField: canViewFieldFn,
    canViewMenu: canViewMenuFn,
    getRoleConfig,
    getExportScopes,
  }), [
    session,
    currentRole,
    login,
    logout,
    switchRole,
    hasPermissionFn,
    assertPermissionFn,
    checkPermissionFn,
    canViewFieldFn,
    canViewMenuFn,
    getRoleConfig,
    getExportScopes,
  ]);

  if (!initialized) {
    return null;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth 必须在 AuthProvider 内部使用");
  }
  return ctx;
}

export function useCurrentRole(): UserRole {
  return useAuth().currentRole;
}

export function usePermission(action: PermissionAction): boolean {
  return useAuth().hasPermission(action);
}

export function useRoleConfig() {
  return useAuth().getRoleConfig();
}
