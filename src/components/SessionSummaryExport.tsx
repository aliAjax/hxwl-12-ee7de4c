import { useState, useMemo, useCallback } from "react";
import type {
  TimelineRecord,
  RiskAssessment,
  InterventionGoal,
  CaseRecord,
} from "../App";
import {
  generateSummary,
  summaryToText,
  copySummaryToClipboard,
  generateExportByScope,
  type GeneratedSummary,
  type ExportResult,
} from "../utils/summaryGenerator";
import { getMaskedItemLabel } from "../utils/desensitize";
import {
  useAuth,
  ProtectedButton,
  PermissionGate,
  hasPermission,
  assertPermission,
  createAuditLog,
  type ExportScope,
  type UserRole,
  getAllAuditLogs,
} from "../auth";

interface Props {
  clientCodes: string[];
  timeline: TimelineRecord[];
  assessments: RiskAssessment[];
  goals: InterventionGoal[];
  caseRecords: CaseRecord[];
  onToast: (message: string, type?: "error" | "success" | "info") => void;
}

export default function SessionSummaryExport({
  clientCodes,
  timeline,
  assessments,
  goals,
  caseRecords,
  onToast,
}: Props) {
  const { currentRole, session, getExportScopes, hasPermission: roleHasPerm, assertPermission: assertPerm } = useAuth();
  const exportScopes = getExportScopes();

  const [selectedClient, setSelectedClient] = useState<string>(
    clientCodes.length > 0 ? clientCodes[0] : ""
  );
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [summary, setSummary] = useState<GeneratedSummary | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [activeScopeKey, setActiveScopeKey] = useState<string>(
    exportScopes.length > 0 ? exportScopes[0].key : ""
  );

  const availableCodes = useMemo(() => {
    const codes = new Set<string>();
    clientCodes.forEach((c) => codes.add(c));
    timeline.forEach((r) => codes.add(r.clientCode));
    assessments.forEach((a) => codes.add(a.clientCode));
    goals.forEach((g) => codes.add(g.clientCode));
    caseRecords.forEach((r) => codes.add(r.clientCode));
    return Array.from(codes).sort();
  }, [clientCodes, timeline, assessments, goals, caseRecords]);

  const activeScope = useMemo(() => {
    return exportScopes.find((s) => s.key === activeScopeKey) || exportScopes[0] || null;
  }, [exportScopes, activeScopeKey]);

  const needsClientSelection = useMemo(() => {
    return activeScopeKey !== "admin_aggregate" && activeScopeKey !== "admin_full";
  }, [activeScopeKey]);

  const dateRangeLabel = useMemo(() => {
    if (startDate && endDate) return `${startDate} 至 ${endDate}`;
    if (startDate) return `${startDate} 至今`;
    if (endDate) return `截至 ${endDate}`;
    return "全部记录";
  }, [startDate, endDate]);

  const handleScopeChange = useCallback((scopeKey: string) => {
    setActiveScopeKey(scopeKey);
    setSummary(null);
    setExportResult(null);
  }, []);

  const recordExportAudit = useCallback(
    (params: {
      scopeKey: string;
      scopeLabel: string;
      desensitized: boolean;
      includes: string[];
      targetClientCode?: string;
      dateRange?: { start?: string; end?: string };
      status: "success" | "denied" | "failed";
      recordCount: number;
      maskedItemCount?: number;
      errorMessage?: string;
    }) => {
      const { scopeKey, scopeLabel, desensitized, includes, targetClientCode, dateRange, status, recordCount, maskedItemCount, errorMessage } = params;
      const permChecked = desensitized ? "export.summary" : "export.full";

      createAuditLog({
        actorRole: currentRole,
        actorName: session?.userName,
        action: "export",
        targetType: "export_report",
        targetId: `export_${Date.now()}`,
        targetLabel: scopeLabel,
        permissionChecked: permChecked,
        status,
        details: {
          scopeKey,
          scopeLabel,
          desensitized,
          includes,
          targetClientCode,
          dateRange,
          recordCount,
          maskedItemCount,
        },
        message: status === "success"
          ? `导出成功：${scopeLabel}（${desensitized ? "已脱敏" : "完整数据"}，${recordCount} 条记录）`
          : status === "denied"
            ? `导出被拒绝：${scopeLabel} - ${errorMessage || "权限不足"}`
            : `导出失败：${scopeLabel} - ${errorMessage || "未知错误"}`,
      });
    },
    [currentRole, session?.userName]
  );

  const handleGenerate = useCallback(() => {
    if (needsClientSelection && !selectedClient) {
      onToast("请选择来访者代号");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      onToast("开始日期不能晚于结束日期");
      return;
    }
    if (!activeScope) {
      onToast("请选择导出类型");
      return;
    }

    const permAction: "export.summary" | "export.full" = activeScope.desensitized ? "export.summary" : "export.full";

    try {
      assertPerm(permAction, activeScope.label);
    } catch (e) {
      recordExportAudit({
        scopeKey: activeScope.key,
        scopeLabel: activeScope.label,
        desensitized: activeScope.desensitized,
        includes: activeScope.includes,
        targetClientCode: needsClientSelection ? selectedClient : undefined,
        dateRange: { start: startDate, end: endDate },
        status: "denied",
        recordCount: 0,
        errorMessage: `无 ${permAction} 权限`,
      });
      onToast("无权限执行此导出操作", "error");
      return;
    }

    setIsGenerating(true);

    setTimeout(() => {
      try {
        const auditLogs = getAllAuditLogs();

        const result = generateExportByScope(
          {
            scopeKey: activeScope.key,
            scopeLabel: activeScope.label,
            includes: activeScope.includes,
            desensitized: activeScope.desensitized,
            operatorRole: currentRole,
            operatorName: session?.userName,
            targetClientCode: needsClientSelection ? selectedClient : undefined,
            dateRange: { start: startDate, end: endDate },
          },
          {
            clientCode: needsClientSelection ? selectedClient : undefined,
            startDate,
            endDate,
            timeline,
            assessments,
            goals,
            caseRecords,
            auditLogs,
          }
        );

        setExportResult(result);
        if (result.summary) {
          setSummary(result.summary);
        }

        recordExportAudit({
          scopeKey: activeScope.key,
          scopeLabel: activeScope.label,
          desensitized: activeScope.desensitized,
          includes: activeScope.includes,
          targetClientCode: needsClientSelection ? selectedClient : undefined,
          dateRange: { start: startDate, end: endDate },
          status: "success",
          recordCount: result.meta.recordCount,
          maskedItemCount: result.allMaskedItems.length,
        });

        const dateRangeStr = startDate || endDate ? `（${dateRangeLabel}）` : "";
        const targetStr = needsClientSelection ? `${selectedClient} 的` : "机构";
        onToast(`已生成 ${targetStr}${activeScope.label}${dateRangeStr}`, "success");
      } catch (e) {
        console.error("生成导出失败:", e);
        recordExportAudit({
          scopeKey: activeScope.key,
          scopeLabel: activeScope.label,
          desensitized: activeScope.desensitized,
          includes: activeScope.includes,
          targetClientCode: needsClientSelection ? selectedClient : undefined,
          dateRange: { start: startDate, end: endDate },
          status: "failed",
          recordCount: 0,
          errorMessage: e instanceof Error ? e.message : "未知错误",
        });
        onToast("生成导出失败，请稍后重试", "error");
      } finally {
        setIsGenerating(false);
      }
    }, 400);
  }, [needsClientSelection, selectedClient, startDate, endDate, activeScope, assertPerm, recordExportAudit, onToast, currentRole, session?.userName, timeline, assessments, goals, caseRecords, dateRangeLabel]);

  const handleCopy = useCallback(async () => {
    if (!exportResult) return;

    const permAction: "export.summary" | "export.full" = activeScope?.desensitized ? "export.summary" : "export.full";
    try {
      assertPerm(permAction, "复制导出内容");
    } catch (e) {
      onToast("无权限复制此导出内容", "error");
      return;
    }

    setIsCopying(true);
    const success = await copySummaryToClipboard(exportResult.content);
    setIsCopying(false);
    if (success) {
      createAuditLog({
        actorRole: currentRole,
        actorName: session?.userName,
        action: "export",
        targetType: "export_report",
        targetLabel: exportResult.meta.scopeLabel,
        permissionChecked: permAction,
        status: "success",
        details: {
          scopeKey: exportResult.meta.scopeKey,
          scopeLabel: exportResult.meta.scopeLabel,
          targetClientCode: exportResult.meta.targetClientCode,
          dateRange: exportResult.meta.dateRange,
          action: "copy_to_clipboard",
        },
        message: `导出内容已复制到剪贴板：${exportResult.meta.scopeLabel}`,
      });
      onToast("导出内容已复制到剪贴板", "success");
    } else {
      onToast("复制失败，请手动选择文本复制", "error");
    }
  }, [exportResult, activeScope?.desensitized, assertPerm, onToast, currentRole, session?.userName]);

  const handleDownload = useCallback(() => {
    if (!exportResult) return;

    const permAction: "export.summary" | "export.full" = activeScope?.desensitized ? "export.summary" : "export.full";
    try {
      assertPerm(permAction, "下载导出文件");
    } catch (e) {
      onToast("无权限下载此导出文件", "error");
      return;
    }

    const blob = new Blob([exportResult.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    const clientPart = exportResult.meta.targetClientCode
      ? `_${exportResult.meta.targetClientCode}`
      : "";
    a.href = url;
    a.download = `导出报告_${exportResult.meta.scopeKey}${clientPart}_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    createAuditLog({
      actorRole: currentRole,
      actorName: session?.userName,
      action: "export",
      targetType: "export_report",
      targetLabel: exportResult.meta.scopeLabel,
      permissionChecked: permAction,
      status: "success",
      details: {
        scopeKey: exportResult.meta.scopeKey,
        scopeLabel: exportResult.meta.scopeLabel,
        targetClientCode: exportResult.meta.targetClientCode,
        dateRange: exportResult.meta.dateRange,
        action: "download_file",
        fileName: a.download,
      },
      message: `导出文件已下载：${exportResult.meta.scopeLabel}`,
    });

    onToast("导出文件已开始下载", "success");
  }, [exportResult, activeScope?.desensitized, assertPerm, onToast, currentRole, session?.userName]);

  const handleReset = useCallback(() => {
    setStartDate("");
    setEndDate("");
    setSummary(null);
    setExportResult(null);
  }, []);

  const scopeInfo = useMemo(() => {
    if (!activeScope) return null;
    const perm = activeScope.desensitized ? "export.summary" : "export.full";
    const permCheck = hasPermission(currentRole, perm);
    return {
      ...activeScope,
      hasPermission: permCheck.allowed,
      permissionDeniedReason: permCheck.reason,
    };
  }, [activeScope, currentRole]);

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>会谈总结</p>
          <h2>咨询摘要导出</h2>
          <p className="section-subtitle">
            根据角色权限，选择导出类型和范围，生成结构化摘要报告
          </p>
        </div>
        {exportResult && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleReset}>重置条件</button>
            <ProtectedButton
              action="export.summary"
              className="secondary-action"
              onClick={handleCopy}
              disabled={isCopying}
            >
              {isCopying ? "复制中..." : "复制文本"}
            </ProtectedButton>
            <ProtectedButton
              action="export.summary"
              className="primary-action"
              onClick={handleDownload}
              disabled={isCopying}
            >
              📥 下载文件
            </ProtectedButton>
          </div>
        )}
      </div>

      <div className="summary-filter-panel">
        <div className="summary-filter-grid">
          <label className="summary-filter-item">
            <span className="filter-label">导出类型</span>
            <div className="export-scope-selector">
              {exportScopes.map((scope) => {
                const permAction = scope.desensitized ? "export.summary" : "export.full";
                const permCheck = hasPermission(currentRole, permAction);
                return (
                  <button
                    key={scope.key}
                    className={`export-scope-btn ${activeScopeKey === scope.key ? "active" : ""} ${!permCheck.allowed ? "disabled" : ""}`}
                    onClick={() => {
                      if (permCheck.allowed) {
                        handleScopeChange(scope.key);
                      } else {
                        onToast(permCheck.reason || "无权限选择此导出类型", "error");
                      }
                    }}
                    title={permCheck.allowed ? "" : permCheck.reason}
                  >
                    <div className="export-scope-icon">
                      {scope.desensitized ? "🔒" : "📄"}
                    </div>
                    <div className="export-scope-info">
                      <div className="export-scope-label">{scope.label}</div>
                      <div className="export-scope-desc">
                        {scope.desensitized ? "已脱敏" : "完整数据"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </label>

          {needsClientSelection && (
            <label className="summary-filter-item">
              <span className="filter-label">来访者代号 *</span>
              <select
                value={selectedClient}
                onChange={(e) => {
                  setSelectedClient(e.target.value);
                  setSummary(null);
                  setExportResult(null);
                }}
              >
                {availableCodes.length === 0 && <option value="">暂无来访者</option>}
                {availableCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="summary-filter-item">
            <span className="filter-label">开始日期</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSummary(null);
                setExportResult(null);
              }}
            />
          </label>

          <label className="summary-filter-item">
            <span className="filter-label">结束日期</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setSummary(null);
                setExportResult(null);
              }}
            />
          </label>

          <div className="summary-filter-item summary-actions">
            {scopeInfo && (
              <div className="export-scope-perm-info">
                <div className="export-scope-perm-status">
                  {scopeInfo.hasPermission ? (
                    <span className="perm-allowed">✅ 有权限导出</span>
                  ) : (
                    <span className="perm-denied">🔒 {scopeInfo.permissionDeniedReason || "无权限"}</span>
                  )}
                </div>
                <div className="export-scope-includes">
                  包含：{scopeInfo.includes.join("、")}
                </div>
                <div className="export-scope-desensitize">
                  {scopeInfo.desensitized ? "🔒 自动脱敏处理" : "📄 完整原始数据"}
                </div>
              </div>
            )}
            <ProtectedButton
              action={activeScope?.desensitized ? "export.summary" : "export.full"}
              className="primary-action full-width"
              onClick={handleGenerate}
              disabled={isGenerating || availableCodes.length === 0 || (needsClientSelection && !selectedClient)}
              auditOnClick={{
                action: "view",
                targetType: "export_report",
                targetLabel: activeScope?.label,
                details: {
                  scopeKey: activeScope?.key,
                  targetClientCode: needsClientSelection ? selectedClient : undefined,
                  dateRange: { start: startDate, end: endDate },
                },
              }}
            >
              {isGenerating ? "生成中..." : `生成${activeScope?.label || "导出"}`}
            </ProtectedButton>
          </div>
        </div>
      </div>

      {!exportResult && !summary && (
        <div className="summary-empty-panel">
          <div className="summary-empty-icon">📄</div>
          <h3>选择条件后生成咨询摘要</h3>
          <p>根据您的角色权限，可生成以下类型的报告：</p>
          <ul className="summary-section-list">
            {exportScopes.map((scope) => {
              const permAction = scope.desensitized ? "export.summary" : "export.full";
              const permCheck = hasPermission(currentRole, permAction);
              return (
                <li key={scope.key}>
                  <strong>
                    {scope.desensitized ? "🔒" : "📄"} {scope.label}
                  </strong>
                  <span>
                    {permCheck.allowed
                      ? `包含：${scope.includes.join("、")}`
                      : `无权限：${permCheck.reason || "缺少导出权限"}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="summary-notice">
            <span className="summary-notice-icon">🛡</span>
            <div>
              <strong>隐私保护</strong>
              <p>
                所有导出操作将被审计记录，包含导出范围、是否脱敏、操作者信息。
                {needsClientSelection && "导出前将自动对姓名、手机号、身份证号等敏感信息进行脱敏处理。"}
              </p>
            </div>
          </div>
        </div>
      )}

      {exportResult && (
        <div className="summary-preview-panel">
          <div className="summary-preview-header">
            <div>
              <h3>
                📋 {exportResult.meta.scopeLabel}
                {exportResult.meta.desensitized ? " 🔒" : ""}
              </h3>
              <p className="summary-preview-meta">
                {exportResult.meta.targetClientCode && (
                  <>
                    来访者 <strong>{exportResult.meta.targetClientCode}</strong> ·
                  </>
                )}
                时间范围 <strong>{dateRangeLabel}</strong> ·
                共 <strong>{exportResult.meta.recordCount}</strong> 条记录 ·
                操作者 <strong>{exportResult.meta.operatorName}</strong>
              </p>
            </div>
            <div className="summary-meta-badges">
              {exportResult.meta.desensitized && (
                <div className="summary-desensitize-badge">
                  <span className="shield-icon">🛡</span>
                  已启用脱敏
                </div>
              )}
              {exportResult.allMaskedItems.length > 0 && (
                <div className="summary-desensitize-badge">
                  <span className="shield-icon">🔒</span>
                  已脱敏 {exportResult.allMaskedItems.length} 项
                </div>
              )}
            </div>
          </div>

          {exportResult.allMaskedItems.length > 0 && (
            <div className="summary-masked-list">
              <div className="summary-masked-title">
                <span>⚠ 以下敏感信息已脱敏处理，导出文本中仅显示脱敏后内容（示例）：</span>
              </div>
              <div className="summary-masked-items">
                {exportResult.allMaskedItems.map((item, idx) => (
                  <span key={idx} className="summary-masked-tag">
                    {getMaskedItemLabel(item)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="summary-raw-preview">
            <div className="summary-raw-header">
              <h4>📝 完整导出文本预览（可复制/下载）</h4>
              <div className="summary-export-actions">
                <ProtectedButton
                  action="export.summary"
                  onClick={handleCopy}
                  disabled={isCopying}
                >
                  {isCopying ? "复制中..." : "📋 复制"}
                </ProtectedButton>
                <ProtectedButton
                  action="export.summary"
                  className="primary-action"
                  onClick={handleDownload}
                >
                  📥 下载
                </ProtectedButton>
              </div>
            </div>
            <pre className="summary-raw-text">{exportResult.content}</pre>
          </div>
        </div>
      )}

      {summary && !exportResult && (
        <div className="summary-preview-panel">
          <div className="summary-preview-header">
            <div>
              <h3>📋 脱敏预览</h3>
              <p className="summary-preview-meta">
                来访者 <strong>{summary.meta.clientCode}</strong> ·
                时间范围 <strong>{dateRangeLabel}</strong> ·
                共 <strong>{summary.meta.sessionCount}</strong> 次会谈
              </p>
            </div>
            {summary.allMaskedItems.length > 0 && (
              <div className="summary-desensitize-badge">
                <span className="shield-icon">🛡</span>
                已脱敏 {summary.allMaskedItems.length} 项敏感信息
              </div>
            )}
          </div>

          {summary.allMaskedItems.length > 0 && (
            <div className="summary-masked-list">
              <div className="summary-masked-title">
                <span>⚠ 以下敏感信息已脱敏处理，导出文本中仅显示脱敏后内容（示例）：</span>
              </div>
              <div className="summary-masked-items">
                {summary.allMaskedItems.map((item, idx) => (
                  <span key={idx} className="summary-masked-tag">
                    {getMaskedItemLabel(item)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="summary-sections">
            <article className="summary-section-card">
              <h4 className="summary-section-title">{summary.basicTopics.title}</h4>
              <pre className="summary-section-content">{summary.basicTopics.content}</pre>
            </article>

            <PermissionGate action="risk.view">
              <article className="summary-section-card">
                <h4 className="summary-section-title">{summary.riskChanges.title}</h4>
                <pre className="summary-section-content">{summary.riskChanges.content}</pre>
              </article>
            </PermissionGate>

            <article className="summary-section-card">
              <h4 className="summary-section-title">{summary.keyInterventions.title}</h4>
              <pre className="summary-section-content">{summary.keyInterventions.content}</pre>
            </article>

            <article className="summary-section-card">
              <h4 className="summary-section-title">{summary.goalProgress.title}</h4>
              <pre className="summary-section-content">{summary.goalProgress.content}</pre>
            </article>

            <article className="summary-section-card">
              <h4 className="summary-section-title">{summary.nextPlan.title}</h4>
              <pre className="summary-section-content">{summary.nextPlan.content}</pre>
            </article>
          </div>

          <div className="summary-footer-actions">
            <button onClick={handleReset}>重新选择条件</button>
            <ProtectedButton
              action="export.summary"
              className="primary-action"
              onClick={handleCopy}
              disabled={isCopying}
            >
              {isCopying ? "复制中..." : "📋 复制完整摘要文本"}
            </ProtectedButton>
          </div>

          <div className="summary-raw-preview">
            <div className="summary-raw-header">
              <h4>📝 完整导出文本预览（可复制）</h4>
            </div>
            <pre className="summary-raw-text">{summaryToText(summary)}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
