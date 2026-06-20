import { useState, useRef, useCallback } from "react";
import {
  createBackupFile,
  validateBackupFile,
  parseBackupFile,
  generateImportPreview,
  prepareImportDataByMode,
  downloadBackupFile,
  type BackupFile,
  type ValidationResult,
  type ImportPreview,
  type ImportMode,
  type SensitiveFieldInfo,
  type ConflictInfo,
} from "../utils/backupImport";
import {
  exportAllDataForBackup,
  importBackupDataAtomically,
  rollbackIndexedDBToSnapshot,
  type ImportResult,
  type ExportedBackupData,
} from "../db";
import {
  getAllAuditLogs,
  replaceAllAuditLogs,
  mergeAuditLogs,
  createAuditLog,
  snapshotAuditLogs,
  restoreAuditLogsFromSnapshot,
  type AuditLogSnapshot,
} from "../auth/auditLog";
import { useAuth, ProtectedButton } from "../auth";
import type {
  CaseRecord,
  TimelineRecord,
  RiskAssessment,
  InterventionGoal,
  CrisisWarning,
  UserRole,
} from "../App";

type Step = "idle" | "validating" | "preview" | "importing" | "success" | "error";

interface BackupImportPanelProps {
  caseRecords: CaseRecord[];
  timeline: TimelineRecord[];
  riskAssessments: RiskAssessment[];
  goals: InterventionGoal[];
  crisisWarnings: CrisisWarning[];
  onImportComplete?: () => void;
}

const storeLabels: Record<string, string> = {
  caseRecords: "个案记录",
  timeline: "会谈时间线",
  riskAssessments: "风险评估",
  goals: "干预目标",
  crisisWarnings: "危机预警",
  auditLogs: "审计日志",
};

const typeLabels: Record<string, string> = {
  idCard: "身份证号",
  phone: "手机号",
  name: "姓名",
  possibleName: "疑似姓名",
};

export default function BackupImportPanel({
  caseRecords,
  timeline,
  riskAssessments,
  goals,
  crisisWarnings,
  onImportComplete,
}: BackupImportPanelProps) {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [backupFile, setBackupFile] = useState<BackupFile | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [includeAuditLogs, setIncludeAuditLogs] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorDataConsistent, setErrorDataConsistent] = useState<boolean>(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!session) return;

    setExporting(true);
    try {
      const dbData = await exportAllDataForBackup();
      const auditLogs = getAllAuditLogs();

      const backup = createBackupFile({
        data: {
          ...dbData,
          auditLogs,
        },
        exportedByRole: session.userRole as UserRole,
        exportedByName: session.userName,
      });

      downloadBackupFile(backup);

      createAuditLog({
        actorRole: session.userRole as UserRole,
        actorName: session.userName,
        action: "export",
        targetType: "data_backup",
        targetLabel: "完整数据备份",
        permissionChecked: "backup.export",
        status: "success",
        details: {
          recordCount: backup.stats.totalRecords,
          backupDate: backup.backupDate,
        },
        message: `导出完整数据备份，共 ${backup.stats.totalRecords} 条记录`,
      });
    } catch (e) {
      console.error("导出失败:", e);
      setErrorMessage(e instanceof Error ? e.message : "导出失败");
      setStep("error");

      createAuditLog({
        actorRole: session.userRole as UserRole,
        actorName: session.userName,
        action: "export",
        targetType: "data_backup",
        targetLabel: "完整数据备份",
        permissionChecked: "backup.export",
        status: "failed",
        details: { error: e instanceof Error ? e.message : String(e) },
        message: "数据备份导出失败",
      });
    } finally {
      setExporting(false);
    }
  }, [session]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setStep("validating");
    setBackupFile(null);
    setValidation(null);
    setPreview(null);
    setImportResult(null);
    setErrorMessage("");
    setErrorDataConsistent(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const validationResult = validateBackupFile(parsed);

        setValidation(validationResult);

        if (validationResult.valid) {
          const backup = parsed as BackupFile;
          setBackupFile(backup);

          const importPreview = generateImportPreview(backup, {
            caseRecords,
            timeline,
            riskAssessments,
            goals,
            crisisWarnings,
          });
          setPreview(importPreview);
        }

        setStep("preview");
      } catch (err) {
        console.error("文件解析失败:", err);
        setErrorMessage(err instanceof Error ? err.message : "文件解析失败");
        setStep("error");
      }
    };

    reader.onerror = () => {
      setErrorMessage("文件读取失败");
      setStep("error");
    };

    reader.readAsText(file);
  }, [caseRecords, timeline, riskAssessments, goals, crisisWarnings]);

  const handleImport = useCallback(async () => {
    if (!backupFile || !session || !preview) return;

    setStep("importing");

    let idbSnapshot: ExportedBackupData | null = null;
    let auditSnapshot: AuditLogSnapshot | null = null;
    let auditLogRollbackNeeded = false;
    let idbRollbackNeeded = false;
    let rollbackErrors: string[] = [];

    try {
      idbSnapshot = await exportAllDataForBackup();
      auditSnapshot = snapshotAuditLogs();

      const preparedImport = prepareImportDataByMode(backupFile, preview, importMode);
      const importData: ExportedBackupData = {
        caseRecords: preparedImport.dataToImport.caseRecords || [],
        timeline: preparedImport.dataToImport.timeline || [],
        riskAssessments: preparedImport.dataToImport.riskAssessments || [],
        goals: preparedImport.dataToImport.goals || [],
        crisisWarnings: preparedImport.dataToImport.crisisWarnings || [],
        meta: preparedImport.dataToImport.meta || {
          nextTimelineId: 1,
          nextRiskId: 1,
          nextGoalId: 1,
          nextCaseRecordId: 1,
          nextCrisisWarningId: 1,
          dbVersion: 3,
        },
      };

      let auditLogResult = { added: 0, total: 0 };
      if (includeAuditLogs && backupFile.data.auditLogs) {
        try {
          if (importMode === "overwrite") {
            replaceAllAuditLogs(backupFile.data.auditLogs);
            auditLogResult = {
              added: backupFile.data.auditLogs.length,
              total: backupFile.data.auditLogs.length,
            };
          } else {
            auditLogResult = mergeAuditLogs(backupFile.data.auditLogs);
          }
          auditLogRollbackNeeded = true;
        } catch (auditErr) {
          console.error("审计日志写入失败:", auditErr);
          throw new Error(
            `审计日志写入失败: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`
          );
        }
      }

      const dbImportMode = importMode === "overwrite" ? "overwrite" : "merge";
      const result = await importBackupDataAtomically(importData, dbImportMode);
      if (!result.success) {
        throw new Error(result.error || "IndexedDB 数据导入失败");
      }
      idbRollbackNeeded = true;

      setImportResult(result);
      setStep("success");

      try {
        createAuditLog({
          actorRole: session.userRole as UserRole,
          actorName: session.userName,
          action: "create",
          targetType: "data_backup",
          targetLabel: "数据备份导入",
          permissionChecked: "backup.import",
          status: "success",
          details: {
            mode: importMode,
            includeAuditLogs,
            importedCounts: result.importedCounts,
            auditLogsAdded: auditLogResult.added,
            skippedIds: Object.fromEntries(preparedImport.skippedIds),
            backupFile: selectedFile?.name,
          },
          message: `数据导入成功，共导入 ${Object.values(result.importedCounts).reduce((a, b) => a + b, 0)} 条业务记录`,
        });
      } catch {
        // 成功后写入审计日志失败不影响主流程
      }

      onImportComplete?.();
    } catch (e) {
      console.error("导入失败，启动补偿回滚流程:", e);

      if (auditLogRollbackNeeded && auditSnapshot) {
        const auditRestored = restoreAuditLogsFromSnapshot(auditSnapshot);
        if (!auditRestored) {
          rollbackErrors.push("审计日志快照恢复失败");
        } else {
          console.warn("[补偿回滚] 审计日志已恢复到导入前状态");
        }
      }

      if (idbRollbackNeeded && idbSnapshot) {
        try {
          const idbRollbackResult = await rollbackIndexedDBToSnapshot(idbSnapshot);
          if (!idbRollbackResult.success) {
            rollbackErrors.push(`IndexedDB 补偿回滚失败: ${idbRollbackResult.error || "未知错误"}`);
          }
        } catch (rbErr) {
          rollbackErrors.push(`IndexedDB 补偿回滚异常: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`);
        }
      }

      const mainError = e instanceof Error ? e.message : "导入失败";
      let finalMessage = mainError;
      let dataConsistent = true;

      if (rollbackErrors.length > 0) {
        dataConsistent = false;
        finalMessage = `${mainError}。补偿回滚异常: ${rollbackErrors.join("; ")}。数据可能处于不一致状态，请联系技术支持！`;
      } else if (auditLogRollbackNeeded || idbRollbackNeeded) {
        finalMessage = `${mainError}。已自动执行补偿回滚，数据已恢复到导入前状态。`;
      }

      setErrorMessage(finalMessage);
      setErrorDataConsistent(dataConsistent);
      setStep("error");

      try {
        createAuditLog({
          actorRole: session.userRole as UserRole,
          actorName: session.userName,
          action: "create",
          targetType: "data_backup",
          targetLabel: "数据备份导入",
          permissionChecked: "backup.import",
          status: "failed",
          details: {
            error: mainError,
            backupFile: selectedFile?.name,
            mode: importMode,
            includeAuditLogs,
            rollbackPerformed: auditLogRollbackNeeded || idbRollbackNeeded,
            rollbackErrors: rollbackErrors.length > 0 ? rollbackErrors : undefined,
            dataConsistent,
          },
          message: `数据备份导入失败${dataConsistent ? "（已回滚）" : "（回滚失败）"}`,
        });
      } catch {
        // ignore audit log write failure in catch
      }
    }
  }, [backupFile, session, preview, importMode, includeAuditLogs, selectedFile?.name, onImportComplete]);

  const handleReset = useCallback(() => {
    setStep("idle");
    setSelectedFile(null);
    setBackupFile(null);
    setValidation(null);
    setPreview(null);
    setImportResult(null);
    setErrorMessage("");
    setErrorDataConsistent(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const renderSensitiveFields = (fields: SensitiveFieldInfo[]) => {
    if (fields.length === 0) {
      return (
        <div className="sensitive-field-item info">
          <span className="sf-icon">✅</span>
          <span className="sf-text">未检测到常见敏感信息</span>
        </div>
      );
    }

    return fields.map((field, index) => (
      <div key={index} className="sensitive-field-item warning">
        <span className="sf-icon">⚠️</span>
        <div className="sf-content">
          <div className="sf-title">
            {field.store} - {field.field}
          </div>
          <div className="sf-types">
            {field.types.map(t => (
              <span key={t} className="sf-type-tag">{typeLabels[t] || t}</span>
            ))}
          </div>
          <div className="sf-count">共 {field.count} 条记录包含此类信息</div>
          <div className="sf-sample">示例：{field.sampleMasked}</div>
        </div>
      </div>
    ));
  };

  const renderConflicts = (conflicts: ConflictInfo[]) => {
    if (conflicts.length === 0) {
      return <p className="tl-empty">无冲突记录</p>;
    }

    const displayConflicts = conflicts.slice(0, 10);
    const hasMore = conflicts.length > 10;

    return (
      <div className="conflict-list">
        {displayConflicts.map((conflict, index) => (
          <div key={index} className="conflict-item">
            <div className="conflict-header">
              <span className="conflict-store">{conflict.store}</span>
              <span className="conflict-label">{conflict.label}</span>
              <span className="conflict-id">ID: {conflict.id}</span>
            </div>
            <div className="conflict-type-badge update">将被更新</div>
          </div>
        ))}
        {hasMore && (
          <div className="conflict-more">
            ...还有 {conflicts.length - 10} 条冲突记录
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="records panel backup-import-panel">
      <div className="section-heading">
        <div>
          <p>数据管理</p>
          <h2>备份与恢复</h2>
          <p className="section-subtitle">
            导出完整数据备份或从备份文件恢复数据 · 所有操作均记录审计日志
          </p>
        </div>
      </div>

      <div className="backup-import-grid">
        <div className="backup-section">
          <div className="backup-section-header">
            <h3>📤 导出备份</h3>
            <p className="backup-section-desc">
              将所有业务数据和审计日志导出为备份文件，用于数据存档或迁移
            </p>
          </div>

          <div className="backup-stats">
            <div className="backup-stat-item">
              <span className="bs-label">个案记录</span>
              <span className="bs-value">{caseRecords.length}</span>
            </div>
            <div className="backup-stat-item">
              <span className="bs-label">会谈时间线</span>
              <span className="bs-value">{timeline.length}</span>
            </div>
            <div className="backup-stat-item">
              <span className="bs-label">风险评估</span>
              <span className="bs-value">{riskAssessments.length}</span>
            </div>
            <div className="backup-stat-item">
              <span className="bs-label">干预目标</span>
              <span className="bs-value">{goals.length}</span>
            </div>
            <div className="backup-stat-item">
              <span className="bs-label">危机预警</span>
              <span className="bs-value">{crisisWarnings.length}</span>
            </div>
            <div className="backup-stat-item">
              <span className="bs-label">审计日志</span>
              <span className="bs-value">{getAllAuditLogs().length}</span>
            </div>
          </div>

          <ProtectedButton
            action="backup.export"
            className="primary-action full-width"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "正在导出..." : "导出完整备份"}
          </ProtectedButton>
        </div>

        <div className="import-section">
          <div className="backup-section-header">
            <h3>📥 导入备份</h3>
            <p className="backup-section-desc">
              从备份文件恢复数据，支持合并、覆盖和跳过模式
            </p>
          </div>

          {step === "idle" && (
            <div className="import-dropzone">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.hxwl-backup.json"
                onChange={handleFileSelect}
                className="import-file-input"
                id="backup-file-input"
              />
              <label htmlFor="backup-file-input" className="import-dropzone-label">
                <div className="dropzone-icon">📁</div>
                <div className="dropzone-text">
                  <strong>点击选择备份文件</strong>
                  <span>支持 .json 或 .hxwl-backup.json 格式</span>
                </div>
              </label>
            </div>
          )}

          {step === "validating" && (
            <div className="import-status">
              <div className="status-spinner">⏳</div>
              <p>正在校验备份文件...</p>
            </div>
          )}

          {(step === "preview" || step === "importing") && validation && preview && backupFile && (
            <div className="import-preview">
              <div className="preview-section">
                <h4>📋 备份文件信息</h4>
                <div className="info-row">
                  <span className="info-label">文件名</span>
                  <span className="info-value">{selectedFile?.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">导出时间</span>
                  <span className="info-value">{new Date(backupFile.backupDate).toLocaleString()}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">导出人</span>
                  <span className="info-value">{backupFile.exportedBy.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">数据版本</span>
                  <span className="info-value">格式 v{backupFile.formatVersion} · DB v{backupFile.dbVersion}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">总记录数</span>
                  <span className="info-value">{backupFile.stats.totalRecords} 条</span>
                </div>
              </div>

              <div className="preview-section">
                <h4>✅ 校验结果</h4>
                {validation.issues.length === 0 ? (
                  <div className="validation-success">
                    <span>✓ 文件校验通过，结构完整</span>
                  </div>
                ) : (
                  <div className="validation-issues">
                    {validation.issues.map((issue, index) => (
                      <div key={index} className={`validation-issue ${issue.severity}`}>
                        <span className="vi-icon">
                          {issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️"}
                        </span>
                        <div className="vi-content">
                          <div className="vi-message">{issue.message}</div>
                          {issue.details && <div className="vi-details">{issue.details}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="preview-section">
                <h4>🔒 敏感信息检测</h4>
                <div className="sensitive-fields-list">
                  {renderSensitiveFields(validation.sensitiveFields)}
                </div>
                {validation.sensitiveFields.length > 0 && (
                  <div className="sensitive-warning">
                    ⚠️ 备份文件包含可能的敏感信息，请注意妥善保管
                  </div>
                )}
              </div>

              <div className="preview-section">
                <h4>📊 导入预览</h4>
                <div className="import-summary-grid">
                  <div className="summary-card new">
                    <span className="sc-label">新增记录</span>
                    <span className="sc-value">{preview.summary.newRecords}</span>
                  </div>
                  <div className="summary-card update">
                    <span className="sc-label">更新记录</span>
                    <span className="sc-value">{preview.summary.updatedRecords}</span>
                  </div>
                  <div className="summary-card unchanged">
                    <span className="sc-label">无变化</span>
                    <span className="sc-value">{preview.summary.unchangedRecords}</span>
                  </div>
                </div>

                <div className="store-breakdown">
                  {Object.entries(preview.summary.byStore).map(([store, counts]) => (
                    <div key={store} className="store-breakdown-row">
                      <span className="sb-store">{storeLabels[store] || store}</span>
                      <div className="sb-counts">
                        <span className="sb-new">+{counts.new}</span>
                        <span className="sb-update">~{counts.update}</span>
                        <span className="sb-unchanged">{counts.unchanged}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {preview.summary.totalConflicts > 0 && (
                  <div className="conflicts-preview">
                    <h5>冲突记录（{preview.summary.totalConflicts} 条）</h5>
                    {renderConflicts(preview.conflicts)}
                  </div>
                )}
              </div>

              {step !== "importing" && (
                <>
                  <div className="preview-section">
                    <h4>⚙️ 导入选项</h4>
                    <div className="import-options">
                      <div className="option-group">
                        <label className="option-label">导入模式</label>
                        <div className="mode-selector">
                          <label className={`mode-option ${importMode === "merge" ? "selected" : ""}`}>
                            <input
                              type="radio"
                              name="importMode"
                              value="merge"
                              checked={importMode === "merge"}
                              onChange={() => setImportMode("merge")}
                            />
                            <span className="mode-name">合并模式</span>
                            <span className="mode-desc">保留现有数据，新增或更新冲突项</span>
                          </label>
                          <label className={`mode-option ${importMode === "overwrite" ? "selected" : ""}`}>
                            <input
                              type="radio"
                              name="importMode"
                              value="overwrite"
                              checked={importMode === "overwrite"}
                              onChange={() => setImportMode("overwrite")}
                            />
                            <span className="mode-name">覆盖模式</span>
                            <span className="mode-desc">删除现有数据，完全替换为备份数据</span>
                          </label>
                          <label className={`mode-option ${importMode === "skip" ? "selected" : ""}`}>
                            <input
                              type="radio"
                              name="importMode"
                              value="skip"
                              checked={importMode === "skip"}
                              onChange={() => setImportMode("skip")}
                            />
                            <span className="mode-name">跳过模式</span>
                            <span className="mode-desc">仅导入新增数据，冲突项保留当前版本</span>
                          </label>
                        </div>
                      </div>

                      <div className="option-group">
                        <label className="checkbox-option">
                          <input
                            type="checkbox"
                            checked={includeAuditLogs}
                            onChange={(e) => setIncludeAuditLogs(e.target.checked)}
                          />
                          <span>导入审计日志</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {importMode === "overwrite" && (
                    <div className="danger-warning">
                      ⚠️ <strong>危险操作：</strong>覆盖模式将删除所有现有数据，此操作不可撤销！
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === "importing" && (
            <div className="import-status">
              <div className="status-spinner">⏳</div>
              <p>正在导入数据，请勿关闭页面...</p>
              <p className="import-note">数据库事务已开启，失败将自动回滚</p>
            </div>
          )}

          {step === "success" && importResult && (
            <div className="import-result success">
              <div className="result-icon">✅</div>
              <h3>导入成功</h3>
              <p className="result-desc">数据已成功导入并写入数据库</p>

              <div className="result-stats">
                {Object.entries(importResult.importedCounts).map(([store, count]) => (
                  <div key={store} className="result-stat">
                    <span className="rs-label">{storeLabels[store] || store}</span>
                    <span className="rs-value">{count} 条</span>
                  </div>
                ))}
              </div>

              <div className="result-actions">
                <ProtectedButton
                  action="backup.import"
                  className="primary-action"
                  onClick={handleReset}
                >
                  继续导入
                </ProtectedButton>
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="import-result error">
              <div className="result-icon">❌</div>
              <h3>导入失败</h3>
              <p className="result-desc">{errorMessage}</p>
              {errorDataConsistent ? (
                <p className="result-note">✅ 数据一致性正常，所有操作已回滚</p>
              ) : (
                <p className="result-note" style={{ color: "#dc2626", fontWeight: 500 }}>
                  ⚠️ 警告：补偿回滚不完全，数据可能处于不一致状态！请立即备份当前数据并联系技术支持。
                </p>
              )}

              <div className="result-actions">
                <ProtectedButton
                  action="backup.import"
                  className="primary-action"
                  onClick={handleReset}
                >
                  重新选择文件
                </ProtectedButton>
              </div>
            </div>
          )}

          {(step === "preview") && (
            <div className="import-actions-bar">
              <button className="secondary-btn" onClick={handleReset}>
                取消
              </button>
              <ProtectedButton
                action="backup.import"
                className="primary-action"
                onClick={handleImport}
              >
                确认导入
              </ProtectedButton>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
