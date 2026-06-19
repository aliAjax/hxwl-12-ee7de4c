import { useState, useMemo } from "react";
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
  type GeneratedSummary,
} from "../utils/summaryGenerator";

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
  const [selectedClient, setSelectedClient] = useState<string>(
    clientCodes.length > 0 ? clientCodes[0] : ""
  );
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [summary, setSummary] = useState<GeneratedSummary | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const availableCodes = useMemo(() => {
    const codes = new Set<string>();
    clientCodes.forEach(c => codes.add(c));
    timeline.forEach(r => codes.add(r.clientCode));
    assessments.forEach(a => codes.add(a.clientCode));
    goals.forEach(g => codes.add(g.clientCode));
    caseRecords.forEach(r => codes.add(r.clientCode));
    return Array.from(codes).sort();
  }, [clientCodes, timeline, assessments, goals, caseRecords]);

  const handleGenerate = () => {
    if (!selectedClient) {
      onToast("请选择来访者代号");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      onToast("开始日期不能晚于结束日期");
      return;
    }

    setIsGenerating(true);
    setTimeout(() => {
      try {
        const result = generateSummary({
          clientCode: selectedClient,
          startDate,
          endDate,
          timeline,
          assessments,
          goals,
          caseRecords,
        });
        setSummary(result);
        const dateRange = startDate || endDate
          ? `（${startDate || "不限"} 至 ${endDate || "不限"}）`
          : "";
        onToast(`已生成 ${selectedClient} ${dateRange} 的会谈摘要`, "success");
      } catch (e) {
        console.error("生成摘要失败:", e);
        onToast("生成摘要失败，请稍后重试");
      } finally {
        setIsGenerating(false);
      }
    }, 300);
  };

  const handleCopy = async () => {
    if (!summary) return;
    setIsCopying(true);
    const text = summaryToText(summary);
    const success = await copySummaryToClipboard(text);
    setIsCopying(false);
    if (success) {
      onToast("摘要文本已复制到剪贴板", "success");
    } else {
      onToast("复制失败，请手动选择文本复制", "error");
    }
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setSummary(null);
  };

  const dateRangeLabel = useMemo(() => {
    if (startDate && endDate) return `${startDate} 至 ${endDate}`;
    if (startDate) return `${startDate} 至今`;
    if (endDate) return `截至 ${endDate}`;
    return "全部记录";
  }, [startDate, endDate]);

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>会谈总结</p>
          <h2>咨询摘要导出</h2>
          <p className="section-subtitle">
            选择来访者和时间范围，生成包含主题、风险、干预、目标和计划的结构化摘要
          </p>
        </div>
        {summary && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleReset}>重置条件</button>
            <button
              className="primary-action"
              onClick={handleCopy}
              disabled={isCopying}
            >
              {isCopying ? "复制中..." : "复制摘要文本"}
            </button>
          </div>
        )}
      </div>

      <div className="summary-filter-panel">
        <div className="summary-filter-grid">
          <label className="summary-filter-item">
            <span className="filter-label">来访者代号 *</span>
            <select
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setSummary(null);
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

          <label className="summary-filter-item">
            <span className="filter-label">开始日期</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSummary(null);
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
              }}
            />
          </label>

          <div className="summary-filter-item summary-actions">
            <button
              className="primary-action full-width"
              onClick={handleGenerate}
              disabled={isGenerating || availableCodes.length === 0}
            >
              {isGenerating ? "生成中..." : "生成脱敏预览"}
            </button>
          </div>
        </div>
      </div>

      {!summary && (
        <div className="summary-empty-panel">
          <div className="summary-empty-icon">📄</div>
          <h3>选择条件后生成咨询摘要</h3>
          <p>摘要将包含以下五个部分：</p>
          <ul className="summary-section-list">
            <li>
              <strong>基本主题</strong>
              <span>咨询主题汇总与主要困扰记录</span>
            </li>
            <li>
              <strong>风险变化</strong>
              <span>风险评估趋势分析与维度得分</span>
            </li>
            <li>
              <strong>关键干预</strong>
              <span>干预方法与技术使用汇总</span>
            </li>
            <li>
              <strong>目标进展</strong>
              <span>干预目标完成进度追踪</span>
            </li>
            <li>
              <strong>下次计划</strong>
              <span>近期计划与待完成练习</span>
            </li>
          </ul>
          <div className="summary-notice">
            <span className="summary-notice-icon">🛡</span>
            <div>
              <strong>隐私保护</strong>
              <p>导出前将自动对姓名、手机号、身份证号等敏感信息进行脱敏处理</p>
            </div>
          </div>
        </div>
      )}

      {summary && (
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
                <span>⚠ 以下敏感信息已脱敏处理，导出文本中不会显示真实内容：</span>
              </div>
              <div className="summary-masked-items">
                {summary.allMaskedItems.map((item, idx) => (
                  <span key={idx} className="summary-masked-tag">
                    {item}
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

            <article className="summary-section-card">
              <h4 className="summary-section-title">{summary.riskChanges.title}</h4>
              <pre className="summary-section-content">{summary.riskChanges.content}</pre>
            </article>

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
            <button
              className="primary-action"
              onClick={handleCopy}
              disabled={isCopying}
            >
              {isCopying ? "复制中..." : "📋 复制完整摘要文本"}
            </button>
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
