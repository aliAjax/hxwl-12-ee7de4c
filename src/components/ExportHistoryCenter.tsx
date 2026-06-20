import { useState, useMemo, useCallback, useEffect } from "react";
import {
  getAllExportHistory,
  getFilteredExportHistory,
  getExportHistoryById,
  deleteExportHistoryEntry,
  clearExportHistory,
  addExportHistoryListener,
  EXPORT_ACTION_LABELS,
  EXPORT_ACTION_ICONS,
  type ExportHistoryEntry,
  type ExportHistoryFilters,
  type ExportActionType,
} from "../utils/exportHistory";
import { ROLE_LABELS, type UserRole } from "../auth/roleConfig";
import { useAuth, ProtectedButton, createAuditLog } from "../auth";

interface Props {
  onToast: (message: string, type?: "error" | "success" | "info") => void;
}

export default function ExportHistoryCenter({ onToast }: Props) {
  const { currentRole, session, assertPermission: assertPerm } = useAuth();
  const [history, setHistory] = useState<ExportHistoryEntry[]>(getAllExportHistory());
  const [selectedEntry, setSelectedEntry] = useState<ExportHistoryEntry | null>(null);
  const [filters, setFilters] = useState<ExportHistoryFilters>({});
  const [filterRole, setFilterRole] = useState<string>("");
  const [filterScopeKey, setFilterScopeKey] = useState<string>("");
  const [filterClientCode, setFilterClientCode] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [filterActionType, setFilterActionType] = useState<string>("");

  useEffect(() => {
    const unsubscribe = addExportHistoryListener((entries) => {
      setHistory(entries);
    });
    return unsubscribe;
  }, []);

  const availableScopeKeys = useMemo(() => {
    const keys = new Set(history.map((e) => e.scopeKey));
    return Array.from(keys);
  }, [history]);

  const availableClientCodes = useMemo(() => {
    const codes = new Set(history.map((e) => e.targetClientCode).filter(Boolean) as string[]);
    return Array.from(codes).sort();
  }, [history]);

  const filtered = useMemo(() => {
    const activeFilters: ExportHistoryFilters = {};
    if (filterRole) activeFilters.operatorRole = filterRole as UserRole;
    if (filterScopeKey) activeFilters.scopeKey = filterScopeKey;
    if (filterClientCode) activeFilters.targetClientCode = filterClientCode;
    if (filterStartDate) activeFilters.startDate = filterStartDate;
    if (filterEndDate) activeFilters.endDate = filterEndDate;
    if (filterActionType) activeFilters.actionType = filterActionType as ExportActionType;
    return getFilteredExportHistory(activeFilters);
  }, [history, filterRole, filterScopeKey, filterClientCode, filterStartDate, filterEndDate, filterActionType]);

  const handleViewSnapshot = useCallback((entry: ExportHistoryEntry) => {
    setSelectedEntry(entry);
  }, []);

  const handleCloseSnapshot = useCallback(() => {
    setSelectedEntry(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      deleteExportHistoryEntry(id);
      if (selectedEntry?.id === id) {
        setSelectedEntry(null);
      }
      onToast("已删除该历史记录", "success");
    },
    [selectedEntry, onToast]
  );

  const handleClearAll = useCallback(() => {
    const count = clearExportHistory();
    setSelectedEntry(null);
    createAuditLog({
      actorRole: currentRole,
      actorName: session?.userName,
      action: "delete",
      targetType: "export_summary",
      status: "success",
      message: `已清空 ${count} 条导出历史记录`,
    });
    onToast(`已清空 ${count} 条导出历史记录`, "success");
  }, [currentRole, session?.userName, onToast]);

  const handleResetFilters = useCallback(() => {
    setFilterRole("");
    setFilterScopeKey("");
    setFilterClientCode("");
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterActionType("");
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const sec = String(d.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}:${sec}`;
  };

  const formatShortDate = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
  };

  const getDateRangeLabel = (entry: ExportHistoryEntry) => {
    const dr = entry.dateRange;
    if (!dr) return "全部记录";
    if (dr.start && dr.end) return `${dr.start} 至 ${dr.end}`;
    if (dr.start) return `${dr.start} 至今`;
    if (dr.end) return `截至 ${dr.end}`;
    return "全部记录";
  };

  const scopeKeyLabels: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    history.forEach((e) => {
      if (!map[e.scopeKey]) map[e.scopeKey] = e.scopeLabel;
    });
    return map;
  }, [history]);

  const isFilterActive = filterRole || filterScopeKey || filterClientCode || filterStartDate || filterEndDate || filterActionType;

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>导出记录</p>
          <h2>导出历史中心</h2>
          <p className="section-subtitle">
            查看所有导出操作历史，支持按条件筛选并重新查看生成的文本快照
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {isFilterActive && (
            <button onClick={handleResetFilters}>重置筛选</button>
          )}
          {history.length > 0 && (
            <ProtectedButton
              action="audit.delete"
              className="secondary-action"
              onClick={handleClearAll}
            >
              清空历史
            </ProtectedButton>
          )}
        </div>
      </div>

      <div className="eh-filter-panel">
        <div className="eh-filter-grid">
          <label className="eh-filter-item">
            <span className="filter-label">操作角色</span>
            <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <option value="">全部角色</option>
              {(["counselor", "supervisor", "admin"] as UserRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>

          <label className="eh-filter-item">
            <span className="filter-label">导出范围</span>
            <select value={filterScopeKey} onChange={(e) => setFilterScopeKey(e.target.value)}>
              <option value="">全部范围</option>
              {availableScopeKeys.map((key) => (
                <option key={key} value={key}>
                  {scopeKeyLabels[key] || key}
                </option>
              ))}
            </select>
          </label>

          <label className="eh-filter-item">
            <span className="filter-label">来访者代号</span>
            <select value={filterClientCode} onChange={(e) => setFilterClientCode(e.target.value)}>
              <option value="">全部来访者</option>
              {availableClientCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          <label className="eh-filter-item">
            <span className="filter-label">操作类型</span>
            <select value={filterActionType} onChange={(e) => setFilterActionType(e.target.value)}>
              <option value="">全部操作</option>
              {(["generate", "copy", "download"] as ExportActionType[]).map((type) => (
                <option key={type} value={type}>
                  {EXPORT_ACTION_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="eh-filter-item">
            <span className="filter-label">开始日期</span>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </label>

          <label className="eh-filter-item">
            <span className="filter-label">结束日期</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
            />
          </label>
        </div>
        <div className="eh-filter-summary">
          共 <strong>{filtered.length}</strong> 条记录
          {isFilterActive && <span className="eh-filter-active-badge">已筛选</span>}
        </div>
      </div>

      {selectedEntry && (
        <div className="eh-snapshot-panel">
          <div className="eh-snapshot-header">
            <div>
              <h3>
                📋 历史快照 - {selectedEntry.scopeLabel}
                {selectedEntry.desensitized ? " 🔒" : ""}
              </h3>
              <p className="eh-snapshot-meta">
                <span className={`eh-action-badge eh-action-${selectedEntry.actionType}`}>
                  {EXPORT_ACTION_ICONS[selectedEntry.actionType]} {EXPORT_ACTION_LABELS[selectedEntry.actionType]}
                </span>
                {selectedEntry.targetClientCode && (
                  <> · 来访者 <strong>{selectedEntry.targetClientCode}</strong></>
                )}
                {" · "}时间范围 <strong>{getDateRangeLabel(selectedEntry)}</strong>
                {" · "}<strong>{selectedEntry.recordCount}</strong> 条记录
                {" · "}{ROLE_LABELS[selectedEntry.operatorRole]} {selectedEntry.operatorName}
                {" · "}{formatDate(selectedEntry.timestamp)}
              </p>
            </div>
            <div className="eh-snapshot-actions">
              <ProtectedButton
                action="export.summary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(selectedEntry.snapshot);
                    onToast("快照内容已复制到剪贴板", "success");
                  } catch {
                    onToast("复制失败", "error");
                  }
                }}
              >
                📋 复制
              </ProtectedButton>
              <ProtectedButton
                action="export.summary"
                className="primary-action"
                onClick={() => {
                  const blob = new Blob([selectedEntry.snapshot], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `历史快照_${selectedEntry.scopeKey}_${selectedEntry.timestamp.slice(0, 10)}.txt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  onToast("快照文件已开始下载", "success");
                }}
              >
                📥 下载
              </ProtectedButton>
              <button onClick={handleCloseSnapshot}>关闭</button>
            </div>
          </div>
          <pre className="eh-snapshot-text">{selectedEntry.snapshot}</pre>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="eh-empty-panel">
          <div className="eh-empty-icon">📭</div>
          <h3>暂无导出历史记录</h3>
          <p>每次生成、复制和下载咨询摘要时，将自动保存一条历史记录</p>
        </div>
      ) : (
        <div className="eh-list">
          {filtered.map((entry) => (
            <article key={entry.id} className="eh-card">
              <div className="eh-card-main" onClick={() => handleViewSnapshot(entry)}>
                <div className="eh-card-left">
                  <span className={`eh-action-icon eh-action-${entry.actionType}`}>
                    {EXPORT_ACTION_ICONS[entry.actionType]}
                  </span>
                  <div className="eh-card-info">
                    <div className="eh-card-top">
                      <span className={`eh-action-badge eh-action-${entry.actionType}`}>
                        {EXPORT_ACTION_LABELS[entry.actionType]}
                      </span>
                      <span className="eh-scope-label">{entry.scopeLabel}</span>
                      {entry.desensitized && (
                        <span className="eh-desensitize-badge">🔒 已脱敏</span>
                      )}
                      {!entry.desensitized && (
                        <span className="eh-full-badge">📄 完整</span>
                      )}
                    </div>
                    <div className="eh-card-detail">
                      <span className="eh-role-tag">{ROLE_LABELS[entry.operatorRole]}</span>
                      <span className="eh-operator-name">{entry.operatorName}</span>
                      {entry.targetClientCode && (
                        <span className="eh-client-tag">{entry.targetClientCode}</span>
                      )}
                      <span className="eh-date-range">{getDateRangeLabel(entry)}</span>
                      <span className="eh-record-count">{entry.recordCount} 条</span>
                    </div>
                    <div className="eh-card-time">{formatShortDate(entry.timestamp)}</div>
                  </div>
                </div>
                <span className="eh-view-arrow">▶</span>
              </div>
              <div className="eh-card-actions">
                <button className="eh-btn-view" onClick={() => handleViewSnapshot(entry)}>
                  查看快照
                </button>
                <ProtectedButton
                  action="audit.delete"
                  className="eh-btn-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entry.id);
                  }}
                >
                  删除
                </ProtectedButton>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
