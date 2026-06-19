import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { PermissionGate, ProtectedButton } from "./PermissionComponents";
import {
  getAllAuditLogs,
  getFilteredAuditLogs,
  deleteAuditLog,
  clearAllAuditLogs,
  getAuditLogStats,
  addAuditLogListener,
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_LABELS,
  AUDIT_STATUS_LABELS,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditActionType,
  type AuditTargetType,
} from "./auditLog";
import { ALL_ROLES, ROLE_CONFIG, ROLE_LABELS, type UserRole } from "./roleConfig";

type SortField = "timestamp" | "actorRole" | "action" | "targetType";
type SortDirection = "asc" | "desc";

const ACTION_TYPES: AuditActionType[] = [
  "create", "update", "delete", "export", "feedback",
  "submit", "login", "role_change", "system_reset", "view",
];

const TARGET_TYPES: AuditTargetType[] = [
  "case_record", "timeline_record", "risk_assessment", "intervention_goal",
  "supervision_record", "supervision_feedback", "export_summary",
  "system", "audit_log", "user_session",
];

export function AuditLogViewer() {
  const { currentRole, hasPermission } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>(() => getAllAuditLogs());
  const [stats, setStats] = useState(() => getAuditLogStats());
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  const refreshLogs = useCallback(() => {
    setLogs(getAllAuditLogs());
    setStats(getAuditLogStats());
  }, []);

  useEffect(() => {
    const remove = addAuditLogListener(() => {
      refreshLogs();
    });
    return () => {
      remove();
    };
  }, [refreshLogs]);

  const filteredLogs = useMemo(() => {
    const result = getFilteredAuditLogs(filters);
    return result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "timestamp":
          cmp = a.timestamp.localeCompare(b.timestamp);
          break;
        case "actorRole":
          cmp = ROLE_LABELS[a.actorRole].localeCompare(ROLE_LABELS[b.actorRole]);
          break;
        case "action":
          cmp = AUDIT_ACTION_LABELS[a.action].localeCompare(AUDIT_ACTION_LABELS[b.action]);
          break;
        case "targetType":
          cmp = AUDIT_TARGET_LABELS[a.targetType].localeCompare(AUDIT_TARGET_LABELS[b.targetType]);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filters, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("确定要删除这条审计日志吗？此操作不可恢复。")) return;
    const result = deleteAuditLog(id, currentRole);
    alert(result.message);
    refreshLogs();
  };

  const handleClearAll = () => {
    if (!confirm("⚠ 确定要清空所有审计日志吗？此操作将永久删除所有记录，不可恢复！")) return;
    if (!confirm("再次确认：清空所有审计日志？")) return;
    const result = clearAllAuditLogs(currentRole);
    alert(result.message);
    refreshLogs();
  };

  const updateFilter = <K extends keyof AuditLogFilters>(key: K, value: AuditLogFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== "");

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className={`sortable-header ${sortField === field ? `sorted-${sortDir}` : ""}`}
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );

  return (
    <section className="records panel audit-log-panel">
      <div className="section-heading">
        <div>
          <p>系统管理</p>
          <h2>📋 审计日志</h2>
          <p className="section-subtitle">
            记录所有用户操作行为，包括新增、编辑、删除、导出、督导反馈等操作 ·
            <strong style={{ color: "#ef4444" }}> 仅机构管理员可删除日志</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={refreshLogs} title="刷新">🔄 刷新</button>
          <PermissionGate action="audit.delete" showDeniedIndicator>
            <button className="tl-btn-danger" onClick={handleClearAll}>
              🗑 清空全部
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="audit-stats-grid">
        <div className="audit-stat-card">
          <span className="audit-stat-label">总记录数</span>
          <strong className="audit-stat-value">{stats.total}</strong>
        </div>
        {ALL_ROLES.map(role => (
          <div key={role} className="audit-stat-card" style={{ borderLeftColor: ROLE_CONFIG[role].color }}>
            <span className="audit-stat-label">{ROLE_CONFIG[role].icon} {ROLE_LABELS[role]}</span>
            <strong className="audit-stat-value">{stats.byRole[role]}</strong>
          </div>
        ))}
        <div className="audit-stat-card status-success">
          <span className="audit-stat-label">✓ 成功</span>
          <strong className="audit-stat-value">{stats.byStatus.success}</strong>
        </div>
        <div className="audit-stat-card status-denied">
          <span className="audit-stat-label">✕ 拒绝</span>
          <strong className="audit-stat-value">{stats.byStatus.denied}</strong>
        </div>
      </div>

      {stats.last7Days.some(d => d.count > 0) && (
        <div className="audit-chart-week">
          <h4 className="audit-section-title">近7日操作趋势</h4>
          <div className="audit-chart-bars">
            {stats.last7Days.map(({ date, count }) => {
              const max = Math.max(...stats.last7Days.map(d => d.count), 1);
              const height = count > 0 ? Math.max(10, (count / max) * 100) : 4;
              const label = new Date(date + "T00:00:00").toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
              return (
                <div key={date} className="audit-chart-bar-col">
                  <div className="audit-chart-bar" style={{ height: `${height}%` }}>
                    <span className="audit-chart-count">{count || ""}</span>
                  </div>
                  <span className="audit-chart-label">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="audit-filters-section">
        <div className="audit-filters-header" onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}>
          <h4 className="audit-section-title">
            🔍 筛选条件
            {hasActiveFilters && <span className="filter-active-badge">已设置</span>}
          </h4>
          <span className="filter-toggle">{isFiltersExpanded ? "收起 ▲" : "展开 ▼"}</span>
        </div>
        {isFiltersExpanded && (
          <div className="audit-filters-grid">
            <label className="audit-filter-item">
              <span>操作角色</span>
              <select
                value={filters.actorRole || ""}
                onChange={e => updateFilter("actorRole", e.target.value as UserRole || undefined)}
              >
                <option value="">全部角色</option>
                {ALL_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_CONFIG[r].icon} {ROLE_LABELS[r]}</option>
                ))}
              </select>
            </label>

            <label className="audit-filter-item">
              <span>操作类型</span>
              <select
                value={filters.action || ""}
                onChange={e => updateFilter("action", e.target.value as AuditActionType || undefined)}
              >
                <option value="">全部类型</option>
                {ACTION_TYPES.map(a => (
                  <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</option>
                ))}
              </select>
            </label>

            <label className="audit-filter-item">
              <span>操作对象</span>
              <select
                value={filters.targetType || ""}
                onChange={e => updateFilter("targetType", e.target.value as AuditTargetType || undefined)}
              >
                <option value="">全部对象</option>
                {TARGET_TYPES.map(t => (
                  <option key={t} value={t}>{AUDIT_TARGET_LABELS[t]}</option>
                ))}
              </select>
            </label>

            <label className="audit-filter-item">
              <span>操作状态</span>
              <select
                value={filters.status || ""}
                onChange={e => updateFilter("status", e.target.value as AuditLogEntry["status"] || undefined)}
              >
                <option value="">全部状态</option>
                <option value="success">成功</option>
                <option value="denied">拒绝</option>
                <option value="failed">失败</option>
              </select>
            </label>

            <label className="audit-filter-item">
              <span>开始日期</span>
              <input
                type="date"
                value={filters.startDate || ""}
                onChange={e => updateFilter("startDate", e.target.value || undefined)}
              />
            </label>

            <label className="audit-filter-item">
              <span>结束日期</span>
              <input
                type="date"
                value={filters.endDate || ""}
                onChange={e => updateFilter("endDate", e.target.value || undefined)}
              />
            </label>

            <label className="audit-filter-item audit-filter-full">
              <span>关键词搜索</span>
              <input
                type="text"
                placeholder="搜索用户名、记录ID、操作描述..."
                value={filters.keyword || ""}
                onChange={e => updateFilter("keyword", e.target.value || undefined)}
              />
            </label>
          </div>
        )}
        {hasActiveFilters && (
          <div className="audit-filters-actions">
            <span>共找到 <strong>{filteredLogs.length}</strong> / {logs.length} 条记录</span>
            <button onClick={resetFilters}>清除筛选</button>
          </div>
        )}
      </div>

      <div className="audit-table-wrapper">
        {filteredLogs.length === 0 ? (
          <div className="audit-empty-state">
            <div className="audit-empty-icon">📭</div>
            <h4>{logs.length === 0 ? "暂无审计日志记录" : "没有匹配的审计记录"}</h4>
            <p>{logs.length === 0 ? "系统操作将自动记录在此处" : "请尝试调整筛选条件"}</p>
          </div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}></th>
                <SortHeader field="timestamp">时间</SortHeader>
                <SortHeader field="actorRole">操作角色</SortHeader>
                <th>操作人</th>
                <SortHeader field="action">操作</SortHeader>
                <SortHeader field="targetType">对象类型</SortHeader>
                <th>对象标识</th>
                <th>状态</th>
                <th>权限校验</th>
                <PermissionGate action="audit.delete">
                  <th style={{ width: "80px" }}>操作</th>
                </PermissionGate>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => {
                const statusStyle = AUDIT_STATUS_LABELS[log.status];
                const isExpanded = expandedId === log.id;
                return (
                  <>
                    <tr
                      key={log.id}
                      className={`audit-row ${log.status !== "success" ? "row-warn" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <td>
                        <span className="expand-arrow">{isExpanded ? "▼" : "▶"}</span>
                      </td>
                      <td className="audit-timestamp">
                        <div>{new Date(log.timestamp).toLocaleString("zh-CN")}</div>
                        <small>{log.id.slice(6, 20)}</small>
                      </td>
                      <td>
                        <span
                          className="role-badge"
                          style={{ background: ROLE_CONFIG[log.actorRole].color }}
                        >
                          {ROLE_CONFIG[log.actorRole].icon} {ROLE_LABELS[log.actorRole]}
                        </span>
                      </td>
                      <td><strong>{log.actorName}</strong></td>
                      <td>
                        <span className={`audit-action-tag action-${log.action}`}>
                          {AUDIT_ACTION_LABELS[log.action]}
                        </span>
                      </td>
                      <td>{AUDIT_TARGET_LABELS[log.targetType]}</td>
                      <td>
                        {log.targetLabel && <div className="target-label">{log.targetLabel}</div>}
                        {log.targetId && <code className="target-id">{log.targetId}</code>}
                        {!log.targetLabel && !log.targetId && <span className="muted">—</span>}
                      </td>
                      <td>
                        <span
                          className="status-pill"
                          style={{ background: statusStyle.color + "20", color: statusStyle.color }}
                        >
                          {statusStyle.label}
                        </span>
                      </td>
                      <td>
                        {log.permissionChecked ? (
                          <code className="perm-code">{log.permissionChecked}</code>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <PermissionGate action="audit.delete">
                        <td onClick={e => e.stopPropagation()}>
                          <ProtectedButton
                            action="audit.delete"
                            className="audit-delete-btn"
                            onClick={() => handleDelete(log.id)}
                            showIfDenied
                          >
                            删除
                          </ProtectedButton>
                        </td>
                      </PermissionGate>
                    </tr>
                    {isExpanded && (
                      <tr className="audit-detail-row">
                        <td colSpan={hasPermission("audit.delete") ? 10 : 9}>
                          <div className="audit-detail-panel">
                            {log.message && (
                              <div className="detail-section">
                                <span className="detail-label">📝 操作描述：</span>
                                <span>{log.message}</span>
                              </div>
                            )}
                            {log.details && Object.keys(log.details).length > 0 && (
                              <div className="detail-section">
                                <span className="detail-label">📊 详细数据：</span>
                                <pre className="detail-json">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                            )}
                            <div className="detail-meta-row">
                              <span>请求ID: <code>{log.id}</code></span>
                              {log.userAgent && (
                                <span title={log.userAgent}>UA: {log.userAgent.slice(0, 60)}...</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="audit-actions-distribution">
        <h4 className="audit-section-title">操作类型分布</h4>
        <div className="action-dist-list">
          {ACTION_TYPES.map(action => {
            const count = stats.byAction[action];
            if (count === 0) return null;
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return (
              <div key={action} className="action-dist-item">
                <div className="action-dist-header">
                  <span className={`audit-action-tag action-${action}`}>{AUDIT_ACTION_LABELS[action]}</span>
                  <span className="action-dist-count">{count} 次 ({pct}%)</span>
                </div>
                <div className="action-dist-bar">
                  <div
                    className={`action-dist-fill action-${action}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
