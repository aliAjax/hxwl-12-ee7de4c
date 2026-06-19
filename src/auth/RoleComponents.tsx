import { useState } from "react";
import { useAuth } from "./AuthContext";
import {
  ROLE_CONFIG,
  ALL_ROLES,
  ROLE_LABELS,
  type UserRole,
  type PermissionAction,
} from "./roleConfig";

const ROLE_USERNAMES: Record<UserRole, string[]> = {
  counselor: ["李咨询师", "张咨询师", "陈咨询师"],
  supervisor: ["王督导", "赵督导"],
  admin: ["系统管理员"],
};

export function RoleSwitcher({
  variant = "vertical",
}: {
  variant?: "vertical" | "horizontal" | "chips" | "card";
}) {
  const { currentRole, switchRole, session } = useAuth();

  if (variant === "chips") {
    return (
      <div className="role-chips-group">
        {ALL_ROLES.map(role => {
          const config = ROLE_CONFIG[role];
          return (
            <button
              key={role}
              className={`role-chip ${currentRole === role ? "active" : ""}`}
              style={currentRole === role ? { borderColor: config.color, color: config.color } : undefined}
              onClick={() => switchRole(role)}
              title={config.description}
            >
              <span className="role-icon">{config.icon}</span>
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className="role-card-switcher">
        <h3 className="role-switcher-title">切换角色</h3>
        <div className="role-cards-grid">
          {ALL_ROLES.map(role => {
            const config = ROLE_CONFIG[role];
            const isActive = currentRole === role;
            return (
              <button
                key={role}
                className={`role-card ${isActive ? "active" : ""}`}
                style={isActive ? { borderColor: config.color } : undefined}
                onClick={() => switchRole(role)}
              >
                <div className="role-card-icon" style={{ background: config.color }}>
                  {config.icon}
                </div>
                <div className="role-card-info">
                  <h4 style={{ color: isActive ? config.color : undefined }}>
                    {config.label}
                  </h4>
                  <p>{config.description}</p>
                  <div className="role-card-perms">
                    <span>{config.permissions.length} 项权限</span>
                    <span>{config.visibleMenus.length} 个菜单</span>
                  </div>
                </div>
                {isActive && (
                  <div className="role-card-active-badge" style={{ background: config.color }}>
                    当前
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === "horizontal") {
    return (
      <div className="role-switcher-horizontal">
        <span className="role-switcher-label">当前角色：</span>
        <div className="role-switcher-tabs">
          {ALL_ROLES.map(role => {
            const config = ROLE_CONFIG[role];
            return (
              <button
                key={role}
                className={`role-tab ${currentRole === role ? "active" : ""}`}
                style={currentRole === role ? { backgroundColor: config.color } : undefined}
                onClick={() => switchRole(role)}
              >
                <span>{config.icon}</span>
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="role-switcher-vertical-wrapper">
      {ALL_ROLES.map(role => {
        const config = ROLE_CONFIG[role];
        return (
          <button
            key={role}
            className={`role-chip ${currentRole === role ? "active" : ""}`}
            style={currentRole === role ? { borderColor: config.color, color: config.color } : undefined}
            onClick={() => switchRole(role)}
          >
            {config.icon} {config.label}
          </button>
        );
      })}
      {session && (
        <div className="role-session-info">
          <span className="session-label">登录用户：</span>
          <strong>{session.userName}</strong>
        </div>
      )}
    </div>
  );
}

export function RoleLoginModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<UserRole>("counselor");
  const [selectedUsername, setSelectedUsername] = useState<string>(ROLE_USERNAMES.counselor[0]);
  const { login } = useAuth();

  if (!isOpen) return null;

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    setSelectedUsername(ROLE_USERNAMES[role][0]);
  };

  const handleLogin = () => {
    login(selectedRole, selectedUsername);
    onClose();
  };

  const allPermissions = new Set<PermissionAction>();
  Object.values(ROLE_CONFIG).forEach(c => {
    c.permissions.forEach(p => allPermissions.add(p));
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content role-login-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔐 登录系统</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="role-login-body">
          <div className="role-select-section">
            <label className="field-label">选择角色</label>
            <div className="role-login-cards">
              {ALL_ROLES.map(role => {
                const config = ROLE_CONFIG[role];
                const selected = selectedRole === role;
                return (
                  <button
                    key={role}
                    className={`role-login-card ${selected ? "selected" : ""}`}
                    style={selected ? { borderColor: config.color } : undefined}
                    onClick={() => handleRoleChange(role)}
                  >
                    <div className="rlc-icon" style={{ background: config.color }}>
                      {config.icon}
                    </div>
                    <div className="rlc-content">
                      <h3 style={{ color: selected ? config.color : undefined }}>
                        {config.label}
                      </h3>
                      <p>{config.description}</p>
                    </div>
                    {selected && (
                      <div className="rlc-check" style={{ background: config.color }}>✓</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="role-select-section">
            <label className="field-label">选择用户</label>
            <select
              className="role-user-select"
              value={selectedUsername}
              onChange={e => setSelectedUsername(e.target.value)}
            >
              {ROLE_USERNAMES[selectedRole].map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="role-permission-preview">
            <h4>角色权限预览</h4>
            <div className="perm-preview-list">
              {ROLE_CONFIG[selectedRole].permissions.map(p => (
                <span key={p} className="perm-tag">
                  {p.split(".").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")}
                </span>
              ))}
            </div>
            <div className="perm-scopes-preview">
              <strong>可导出范围：</strong>
              {ROLE_CONFIG[selectedRole].exportScopes.length > 0 ? (
                ROLE_CONFIG[selectedRole].exportScopes.map(s => (
                  <span key={s.key} className={`export-scope-tag ${s.desensitized ? "desensitized" : "full"}`}>
                    {s.desensitized ? "🛡 " : "📄 "}
                    {s.label}
                  </span>
                ))
              ) : (
                <span className="no-export">无可导出内容</span>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleLogin}>
            以 {ROLE_LABELS[selectedRole]} 身份登录
          </button>
        </div>
      </div>
    </div>
  );
}

export function UserInfoBar() {
  const { session, currentRole, logout } = useAuth();
  const config = ROLE_CONFIG[currentRole];
  const [showLogin, setShowLogin] = useState(false);

  return (
    <>
      <div className="user-info-bar">
        <div className="user-avatar" style={{ background: config.color }}>
          {config.icon}
        </div>
        <div className="user-details">
          <span className="user-name">{session?.userName || "未登录"}</span>
          <span className="user-role" style={{ color: config.color }}>
            {config.label}
          </span>
        </div>
        <div className="user-actions">
          <button className="user-action-btn" onClick={() => setShowLogin(true)} title="切换账号">
            🔄
          </button>
          <button className="user-action-btn" onClick={logout} title="退出登录">
            ⎋
          </button>
        </div>
      </div>
      <RoleLoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
}

export function RolePermissionLegend() {
  return (
    <div className="role-permission-legend">
      <h4>角色权限说明</h4>
      <div className="legend-list">
        {ALL_ROLES.map(role => {
          const config = ROLE_CONFIG[role];
          return (
            <div key={role} className="legend-item">
              <span className="legend-icon" style={{ background: config.color }}>
                {config.icon}
              </span>
              <div className="legend-content">
                <strong>{config.label}</strong>
                <small>{config.description}</small>
                <div className="legend-perms">
                  权限：{config.permissions.length} 项 ·
                  菜单：{config.visibleMenus.length} 个 ·
                  导出：{config.exportScopes.length} 种
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
