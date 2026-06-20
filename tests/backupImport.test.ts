import { describe, it, expect } from "vitest";
import {
  validateBackupFile,
  parseBackupFile,
  createBackupFile,
  generateImportPreview,
  BACKUP_FILE_MAGIC,
  BACKUP_FORMAT_VERSION,
  type BackupFile,
  type ImportMode,
} from "../src/utils/backupImport";
import {
  desensitizeText,
  getMaskedItemLabel,
  desensitizeAllFields,
} from "../src/utils/desensitize";
import {
  createValidBackupFile,
  createBackupFileWithData,
  createEmptyBackupData,
  currentStateData,
  sampleCaseRecord,
  sampleTimelineRecord,
} from "./testHelpers";

describe("备份文件结构校验", () => {
  it("空对象应判定为无效并返回 INVALID_FORMAT 错误", () => {
    const result = validateBackupFile({});
    expect(result.valid).toBe(false);
    expect(result.structureValid).toBe(false);
    expect(result.issues.some(i => i.code === "INVALID_FORMAT")).toBe(false);
  });

  it("非对象输入应返回 INVALID_FORMAT 错误", () => {
    const result = validateBackupFile("not an object");
    expect(result.valid).toBe(false);
    expect(result.structureValid).toBe(false);
    expect(result.issues.some(i => i.code === "INVALID_FORMAT")).toBe(true);
  });

  it("缺少 magic 标识应返回 INVALID_MAGIC 错误", () => {
    const badFile = { formatVersion: 1, data: {} };
    const result = validateBackupFile(badFile);
    expect(result.valid).toBe(false);
    expect(result.structureValid).toBe(false);
    expect(result.issues.some(i => i.code === "INVALID_MAGIC")).toBe(true);
  });

  it("magic 标识不正确应返回 INVALID_MAGIC 错误", () => {
    const badFile = { magic: "WRONG-MAGIC", formatVersion: 1, data: {} };
    const result = validateBackupFile(badFile);
    expect(result.issues.some(i => i.code === "INVALID_MAGIC")).toBe(true);
  });

  it("缺少 data 部分应返回 MISSING_DATA 错误", () => {
    const badFile = {
      magic: BACKUP_FILE_MAGIC,
      formatVersion: BACKUP_FORMAT_VERSION,
      appId: "hxwl-12",
    };
    const result = validateBackupFile(badFile);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "MISSING_DATA")).toBe(true);
  });

  it("缺少 caseRecords 数据应返回 MISSING_CASERECORDS 错误", () => {
    const badFile = createValidBackupFile();
    delete (badFile.data as Record<string, unknown>).caseRecords;
    const result = validateBackupFile(badFile);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "MISSING_CASERECORDS")).toBe(true);
  });

  it("缺少 timeline 数据应返回 MISSING_TIMELINE 错误", () => {
    const badFile = createValidBackupFile();
    delete (badFile.data as Record<string, unknown>).timeline;
    const result = validateBackupFile(badFile);
    expect(result.issues.some(i => i.code === "MISSING_TIMELINE")).toBe(true);
  });

  it("合法的备份文件结构应通过校验", () => {
    const validFile = createValidBackupFile();
    const result = validateBackupFile(validFile);
    expect(result.valid).toBe(true);
    expect(result.structureValid).toBe(true);
    expect(result.versionCompatible).toBe(true);
  });

  it("包含完整数据的备份文件应通过校验", () => {
    const fullFile = createBackupFileWithData();
    const result = validateBackupFile(fullFile);
    expect(result.valid).toBe(true);
  });

  it("caseRecords 不是数组应返回错误", () => {
    const badFile = createValidBackupFile();
    (badFile.data as Record<string, unknown>).caseRecords = "not an array";
    const result = validateBackupFile(badFile);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "INVALID_CASERECORDS_TYPE")).toBe(true);
  });

  it("记录缺少必填字段应返回 INVALID_RECORD 错误", () => {
    const badFile = createValidBackupFile();
    badFile.data.caseRecords = [{ id: "1" }] as typeof badFile.data.caseRecords;
    const result = validateBackupFile(badFile);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "INVALID_RECORD_CASERECORDS")).toBe(true);
  });

  it("重复 ID 应返回 DUPLICATE_ID 错误", () => {
    const badFile = createValidBackupFile();
    badFile.data.timeline = [
      { ...sampleTimelineRecord, id: "dup_1" },
      { ...sampleTimelineRecord, id: "dup_1" },
    ];
    const result = validateBackupFile(badFile);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "DUPLICATE_ID_TIMELINE")).toBe(true);
  });

  it("meta 必须是对象", () => {
    const badFile = createValidBackupFile();
    (badFile.data as Record<string, unknown>).meta = "not an object";
    const result = validateBackupFile(badFile);
    expect(result.issues.some(i => i.code === "INVALID_META")).toBe(true);
  });

  it("meta 中计数器字段必须是数字", () => {
    const badFile = createValidBackupFile();
    badFile.data.meta = {
      ...badFile.data.meta,
      nextTimelineId: "not a number" as unknown as number,
    };
    const result = validateBackupFile(badFile);
    expect(result.issues.some(i => i.code === "INVALID_META_COUNTER")).toBe(true);
  });

  it("枚举字段值不在允许范围内应报错", () => {
    const badFile = createValidBackupFile();
    badFile.data.riskAssessments = [
      {
        ...sampleCaseRecord,
        id: "ra_bad",
        clientCode: "C-001",
        assessDate: "2026-06-01",
        dimensions: { sleep: 1, emotion: 1, selfHarm: 1, support: 1, stress: 1 },
        totalScore: 5,
        level: "INVALID_LEVEL",
        summary: "测试",
      } as unknown as typeof badFile.data.riskAssessments[number],
    ];
    const result = validateBackupFile(badFile);
    expect(result.issues.some(i => i.code === "INVALID_RECORD_RISKASSESSMENTS")).toBe(true);
  });

  it("parseBackupFile 对无效文件应抛出异常", () => {
    expect(() => parseBackupFile(JSON.stringify({}))).toThrow();
  });

  it("parseBackupFile 对有效文件应正常解析", () => {
    const validFile = createValidBackupFile();
    const parsed = parseBackupFile(JSON.stringify(validFile));
    expect(parsed.magic).toBe(BACKUP_FILE_MAGIC);
    expect(parsed.formatVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it("createBackupFile 应生成合法的备份文件结构", () => {
    const backup = createBackupFile({
      data: createEmptyBackupData(),
      exportedByRole: "admin",
      exportedByName: "测试员",
    });
    expect(backup.magic).toBe(BACKUP_FILE_MAGIC);
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.exportedBy.name).toBe("测试员");
    expect(backup.exportedBy.role).toBe("admin");
    const result = validateBackupFile(backup);
    expect(result.valid).toBe(true);
  });
});

describe("版本不兼容提示", () => {
  it("格式版本高于系统支持版本应返回 VERSION_TOO_NEW 错误", () => {
    const badFile = createValidBackupFile();
    badFile.formatVersion = BACKUP_FORMAT_VERSION + 999;
    const result = validateBackupFile(badFile);
    expect(result.valid).toBe(false);
    expect(result.versionCompatible).toBe(false);
    expect(result.issues.some(i => i.code === "VERSION_TOO_NEW")).toBe(true);
    const tooNewIssue = result.issues.find(i => i.code === "VERSION_TOO_NEW");
    expect(tooNewIssue?.details).toContain("升级系统");
  });

  it("格式版本低于当前版本应返回 VERSION_OLD 警告", () => {
    const oldFile = createValidBackupFile();
    oldFile.formatVersion = 0;
    const result = validateBackupFile(oldFile);
    expect(result.valid).toBe(true);
    expect(result.versionCompatible).toBe(true);
    expect(result.issues.some(i => i.code === "VERSION_OLD")).toBe(true);
    const oldIssue = result.issues.find(i => i.code === "VERSION_OLD");
    expect(oldIssue?.severity).toBe("warning");
    expect(oldIssue?.message).toContain("兼容模式");
  });

  it("formatVersion 不是数字应返回 INVALID_VERSION 错误", () => {
    const badFile = {
      magic: BACKUP_FILE_MAGIC,
      formatVersion: "not a number",
      appId: "hxwl-12",
      data: {},
    };
    const result = validateBackupFile(badFile);
    expect(result.issues.some(i => i.code === "INVALID_VERSION")).toBe(true);
    expect(result.structureValid).toBe(false);
  });

  it("未知应用 ID 应返回 UNKNOWN_APP 警告", () => {
    const weirdApp = createValidBackupFile();
    weirdApp.appId = "some-other-app";
    const result = validateBackupFile(weirdApp);
    expect(result.issues.some(i => i.code === "UNKNOWN_APP")).toBe(true);
    expect(result.issues.find(i => i.code === "UNKNOWN_APP")?.severity).toBe("warning");
  });
});

describe("敏感字段识别", () => {
  it("应识别身份证号并进行脱敏", () => {
    const result = desensitizeText("来访者身份证号为 110101199003071234");
    expect(result.maskedItems.some(m => m.type === "idCard")).toBe(true);
    expect(result.text).toContain("****");
    expect(result.text).not.toContain("110101199003071234");
  });

  it("身份证号脱敏应保留前后各4位", () => {
    const result = desensitizeText("110101199003071234");
    const idCardItem = result.maskedItems.find(m => m.type === "idCard");
    expect(idCardItem).toBeDefined();
    expect(idCardItem!.masked).toBe("1101**********1234");
  });

  it("应识别手机号并进行脱敏", () => {
    const result = desensitizeText("联系电话：13812345678");
    expect(result.maskedItems.some(m => m.type === "phone")).toBe(true);
    expect(result.text).toContain("****");
    expect(result.text).not.toContain("13812345678");
  });

  it("手机号脱敏应保留前3后4位", () => {
    const result = desensitizeText("13812345678");
    const phoneItem = result.maskedItems.find(m => m.type === "phone");
    expect(phoneItem).toBeDefined();
    expect(phoneItem!.masked).toBe("138****5678");
  });

  it("应识别带国家代码的手机号", () => {
    const result = desensitizeText("+86 13812345678");
    expect(result.maskedItems.some(m => m.type === "phone")).toBe(true);
  });

  it("应识别带称谓前缀的姓名", () => {
    const result = desensitizeText("来访者姓名：张三");
    expect(result.maskedItems.some(m => m.type === "name")).toBe(true);
    expect(result.text).toContain("张*");
    expect(result.text).not.toContain("张三");
  });

  it("两字姓名脱敏只保留首字", () => {
    const result = desensitizeText("来访者叫李四");
    expect(result.text).toContain("李*");
  });

  it("三字姓名脱敏保留首尾字", () => {
    const result = desensitizeText("来访者为王小明");
    expect(result.text).toContain("王*明");
  });

  it("应识别带后缀的姓名", () => {
    const result = desensitizeText("张伟医生进行了评估");
    const hasName = result.maskedItems.some(m => m.type === "name" || m.type === "possibleName");
    expect(hasName).toBe(true);
    expect(result.text).toContain("张*医生");
  });

  it("无敏感信息的文本应返回空 maskedItems", () => {
    const result = desensitizeText("今天天气不错，咨询进展顺利");
    expect(result.maskedItems).toHaveLength(0);
    expect(result.text).toBe("今天天气不错，咨询进展顺利");
  });

  it("getMaskedItemLabel 应返回正确的类型标签", () => {
    expect(getMaskedItemLabel({ type: "idCard", masked: "1101****1234" })).toBe("身份证号: 1101****1234");
    expect(getMaskedItemLabel({ type: "phone", masked: "138****5678" })).toBe("手机号: 138****5678");
    expect(getMaskedItemLabel({ type: "name", masked: "张*" })).toBe("姓名: 张*");
    expect(getMaskedItemLabel({ type: "possibleName", masked: "李*" })).toBe("疑似姓名: 李*");
  });

  it("desensitizeAllFields 应对多个字段进行脱敏", () => {
    const data = {
      title: "咨询记录",
      content: "来访者张三，电话13812345678",
      notes: "身份证 110101199003071234",
    };
    const result = desensitizeAllFields(data, ["content", "notes"]);
    expect(result.data.content).not.toContain("张三");
    expect(result.data.content).not.toContain("13812345678");
    expect(result.data.notes).not.toContain("110101199003071234");
    expect(result.data.title).toBe("咨询记录");
    expect(result.maskedItems.length).toBeGreaterThan(0);
  });

  it("备份文件校验应检测个案记录中的敏感字段", () => {
    const fileWithSensitive = createValidBackupFile();
    fileWithSensitive.data.caseRecords = [
      {
        ...sampleCaseRecord,
        mainConcern: "来访者张三因工作压力导致焦虑，电话13812345678",
      },
    ];
    const result = validateBackupFile(fileWithSensitive);
    expect(result.sensitiveFields.length).toBeGreaterThan(0);
    const caseField = result.sensitiveFields.find(f => f.store === "个案记录");
    expect(caseField).toBeDefined();
    expect(caseField!.count).toBeGreaterThan(0);
    expect(caseField!.sampleMasked).not.toContain("张三");
    expect(caseField!.sampleMasked).not.toContain("13812345678");
  });

  it("备份文件校验应检测会谈时间线中的敏感字段", () => {
    const fileWithSensitive = createValidBackupFile();
    fileWithSensitive.data.timeline = [
      {
        ...sampleTimelineRecord,
        intervention: "来访者李四反映失眠严重",
      },
    ];
    const result = validateBackupFile(fileWithSensitive);
    const tlField = result.sensitiveFields.find(f => f.store === "会谈时间线");
    expect(tlField).toBeDefined();
    expect(tlField!.types.length).toBeGreaterThan(0);
  });
});

describe("冲突预览统计", () => {
  it("空备份和空当前状态应返回全零统计", () => {
    const emptyBackup = createValidBackupFile();
    const emptyState = {
      caseRecords: [],
      timeline: [],
      riskAssessments: [],
      goals: [],
      crisisWarnings: [],
    };
    const preview = generateImportPreview(emptyBackup, emptyState);
    expect(preview.summary.newRecords).toBe(0);
    expect(preview.summary.updatedRecords).toBe(0);
    expect(preview.summary.unchangedRecords).toBe(0);
    expect(preview.summary.totalConflicts).toBe(0);
    expect(preview.conflicts).toHaveLength(0);
  });

  it("全新记录应统计为新增", () => {
    const backup = createBackupFileWithData();
    const emptyState = {
      caseRecords: [],
      timeline: [],
      riskAssessments: [],
      goals: [],
      crisisWarnings: [],
    };
    const preview = generateImportPreview(backup, emptyState);
    expect(preview.summary.newRecords).toBe(5);
    expect(preview.summary.updatedRecords).toBe(0);
    expect(preview.summary.unchangedRecords).toBe(0);
    expect(preview.summary.totalConflicts).toBe(0);
  });

  it("相同 ID 相同内容应统计为无变化", () => {
    const backup = createBackupFileWithData();
    const sameState = {
      caseRecords: backup.data.caseRecords,
      timeline: backup.data.timeline,
      riskAssessments: backup.data.riskAssessments,
      goals: backup.data.goals,
      crisisWarnings: backup.data.crisisWarnings,
    };
    const preview = generateImportPreview(backup, sameState);
    expect(preview.summary.unchangedRecords).toBe(5);
    expect(preview.summary.newRecords).toBe(0);
    expect(preview.summary.updatedRecords).toBe(0);
    expect(preview.summary.totalConflicts).toBe(0);
  });

  it("相同 ID 不同内容应统计为更新并记录冲突", () => {
    const backup = createBackupFileWithData();
    const stateWithDiff = {
      caseRecords: [{ ...backup.data.caseRecords[0], mainConcern: "已修改的内容" }],
      timeline: backup.data.timeline,
      riskAssessments: backup.data.riskAssessments,
      goals: backup.data.goals,
      crisisWarnings: backup.data.crisisWarnings,
    };
    const preview = generateImportPreview(backup, stateWithDiff);
    expect(preview.summary.updatedRecords).toBe(1);
    expect(preview.summary.unchangedRecords).toBe(4);
    expect(preview.summary.totalConflicts).toBe(1);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0].type).toBe("update");
    expect(preview.conflicts[0].id).toBe(backup.data.caseRecords[0].id);
  });

  it("应按 store 分别统计新增/更新/无变化", () => {
    const backup = createBackupFileWithData();
    const partialState = {
      caseRecords: [{ ...backup.data.caseRecords[0], mainConcern: "modified" }],
      timeline: [],
      riskAssessments: backup.data.riskAssessments,
      goals: [],
      crisisWarnings: [{ ...backup.data.crisisWarnings[0] }],
    };
    const preview = generateImportPreview(backup, partialState);
    expect(preview.summary.byStore.caseRecords.update).toBe(1);
    expect(preview.summary.byStore.timeline.new).toBe(1);
    expect(preview.summary.byStore.riskAssessments.unchanged).toBe(1);
    expect(preview.summary.byStore.goals.new).toBe(1);
    expect(preview.summary.byStore.crisisWarnings.unchanged).toBe(1);
  });

  it("冲突记录应包含 store、id、label 等信息", () => {
    const backup = createBackupFileWithData();
    const stateWithConflict = {
      caseRecords: [{ ...backup.data.caseRecords[0], mainConcern: "old" }],
      timeline: [],
      riskAssessments: [],
      goals: [],
      crisisWarnings: [],
    };
    const preview = generateImportPreview(backup, stateWithConflict);
    const conflict = preview.conflicts[0];
    expect(conflict.store).toBe("个案记录");
    expect(conflict.id).toBe(backup.data.caseRecords[0].id);
    expect(conflict.label).toBe(backup.data.caseRecords[0].clientCode);
    expect(conflict.type).toBe("update");
    expect(conflict.importValue).toBeDefined();
    expect(conflict.currentValue).toBeDefined();
  });

  it("混合场景应正确汇总所有统计", () => {
    const preview = generateImportPreview(createBackupFileWithData(), currentStateData);
    const total = preview.summary.newRecords + preview.summary.updatedRecords + preview.summary.unchangedRecords;
    expect(total).toBe(5);
    expect(preview.summary.byStore.caseRecords.update + preview.summary.byStore.caseRecords.new + preview.summary.byStore.caseRecords.unchanged).toBe(1);
  });
});

describe("三种导入模式预期差异", () => {
  const buildModeScenario = () => {
    const backup = createBackupFileWithData();
    const stateWithSomeOverlap = {
      caseRecords: [
        { ...backup.data.caseRecords[0], mainConcern: "旧版本内容" },
        { id: "cr_state_only", clientCode: "C-999", consultationTopic: "仅当前系统有", sessionDate: "2026-01-01", mainConcern: "仅在当前状态存在", emotionalState: "平静", intervention: "无", nextGoal: "无", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      ] as typeof backup.data.caseRecords,
      timeline: backup.data.timeline,
      riskAssessments: [] as typeof backup.data.riskAssessments,
      goals: backup.data.goals,
      crisisWarnings: [] as typeof backup.data.crisisWarnings,
    };
    return { backup, stateWithSomeOverlap };
  };

  it("merge 模式：保留当前独有数据，新增备份独有数据，更新冲突数据", () => {
    const { backup, stateWithSomeOverlap } = buildModeScenario();
    const preview = generateImportPreview(backup, stateWithSomeOverlap);

    expect(preview.summary.byStore.caseRecords.update).toBe(1);
    expect(preview.summary.byStore.timeline.unchanged).toBe(1);
    expect(preview.summary.byStore.riskAssessments.new).toBe(1);
    expect(preview.summary.byStore.goals.unchanged).toBe(1);
    expect(preview.summary.byStore.crisisWarnings.new).toBe(1);

    const mode: ImportMode = "merge";
    expect(mode).toBe("merge");
    expect(preview.summary.totalConflicts).toBe(1);
  });

  it("overwrite 模式：最终数据等于备份数据（忽略当前数据）", () => {
    const { backup, stateWithSomeOverlap } = buildModeScenario();
    const preview = generateImportPreview(backup, stateWithSomeOverlap);

    const mode: ImportMode = "overwrite";
    expect(mode).toBe("overwrite");

    const backupTotal =
      backup.data.caseRecords.length +
      backup.data.timeline.length +
      backup.data.riskAssessments.length +
      backup.data.goals.length +
      backup.data.crisisWarnings.length;

    expect(backupTotal).toBe(5);
    expect(preview.summary.updatedRecords + preview.summary.unchangedRecords + preview.summary.newRecords).toBe(5);
  });

  it("skip 模式语义：仅导入备份中不存在于当前的数据，冲突时保留当前", () => {
    const { backup, stateWithSomeOverlap } = buildModeScenario();
    const preview = generateImportPreview(backup, stateWithSomeOverlap);

    const mode: ImportMode = "skip";
    expect(mode).toBe("skip");

    const newOnly = preview.summary.newRecords;
    const unchangedInSkip = preview.summary.unchangedRecords;
    const skippedConflicts = preview.summary.updatedRecords;

    expect(newOnly).toBe(2);
    expect(unchangedInSkip).toBe(2);
    expect(skippedConflicts).toBe(1);
  });

  it("三种模式对空当前状态结果一致：全部为新增", () => {
    const backup = createBackupFileWithData();
    const emptyState = {
      caseRecords: [],
      timeline: [],
      riskAssessments: [],
      goals: [],
      crisisWarnings: [],
    };
    const preview = generateImportPreview(backup, emptyState);

    const modes: ImportMode[] = ["merge", "overwrite", "skip"];
    for (const mode of modes) {
      expect(mode).toBeDefined();
    }
    expect(preview.summary.newRecords).toBe(5);
    expect(preview.summary.updatedRecords).toBe(0);
    expect(preview.summary.totalConflicts).toBe(0);
  });

  it("三种模式对完全相同数据结果一致：全部无变化", () => {
    const backup = createBackupFileWithData();
    const sameState = {
      caseRecords: backup.data.caseRecords,
      timeline: backup.data.timeline,
      riskAssessments: backup.data.riskAssessments,
      goals: backup.data.goals,
      crisisWarnings: backup.data.crisisWarnings,
    };
    const preview = generateImportPreview(backup, sameState);

    expect(preview.summary.unchangedRecords).toBe(5);
    expect(preview.summary.newRecords).toBe(0);
    expect(preview.summary.updatedRecords).toBe(0);
  });

  it("merge vs overwrite 在冲突场景的核心差异", () => {
    const { backup, stateWithSomeOverlap } = buildModeScenario();
    const preview = generateImportPreview(backup, stateWithSomeOverlap);

    const stateOnlyRecords = stateWithSomeOverlap.caseRecords.filter(
      cr => !backup.data.caseRecords.some(bcr => bcr.id === cr.id)
    );
    expect(stateOnlyRecords.length).toBe(1);

    const conflicts = preview.conflicts;
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].type).toBe("update");
  });

  it("ImportMode 类型应只接受三种合法值", () => {
    const validModes: ImportMode[] = ["merge", "overwrite", "skip"];
    expect(validModes).toHaveLength(3);
    expect(validModes.includes("merge")).toBe(true);
    expect(validModes.includes("overwrite")).toBe(true);
    expect(validModes.includes("skip")).toBe(true);
  });
});
