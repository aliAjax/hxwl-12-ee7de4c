import type { TimelineRecord, RiskAssessment, InterventionGoal, CaseRecord, CrisisWarning, CrisisStrategy } from "./App";

const DB_NAME = "hxwl12_case_archive";
const DB_VERSION = 3;

const STORES = {
  timeline: "timeline",
  riskAssessments: "risk_assessments",
  goals: "goals",
  caseRecords: "case_records",
  crisisWarnings: "crisis_warnings",
  meta: "meta",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

export interface AppData {
  timeline: TimelineRecord[];
  riskAssessments: RiskAssessment[];
  goals: InterventionGoal[];
  caseRecords: CaseRecord[];
  crisisWarnings: CrisisWarning[];
  nextTimelineId: number;
  nextRiskId: number;
  nextGoalId: number;
  nextCaseRecordId: number;
  nextCrisisWarningId: number;
}

export interface DBStatus {
  isSupported: boolean;
  isConnected: boolean;
  version: number;
  error?: string;
}

export type DBEventType = "upgrade" | "blocked" | "error" | "success";
export type DBEventListener = (event: DBEventType, data?: unknown) => void;

const listeners = new Set<DBEventListener>();

function emit(event: DBEventType, data?: unknown) {
  listeners.forEach(fn => {
    try { fn(event, data); } catch (e) { /* ignore */ }
  });
}

export function addDBListener(fn: DBEventListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function checkDBSupport(): boolean {
  return typeof indexedDB !== "undefined" && "open" in indexedDB;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!checkDBSupport()) {
      const error = new Error("当前浏览器不支持 IndexedDB，请使用现代浏览器");
      emit("error", error);
      reject(error);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      const transaction = (event.target as IDBOpenDBRequest).transaction;

      console.info(`[DB] 数据库升级: v${oldVersion} → v${DB_VERSION}`);
      emit("upgrade", { from: oldVersion, to: DB_VERSION });

      try {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(STORES.timeline)) {
            const tlStore = db.createObjectStore(STORES.timeline, { keyPath: "id" });
            tlStore.createIndex("clientCode", "clientCode", { unique: false });
            tlStore.createIndex("sessionDate", "sessionDate", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.riskAssessments)) {
            const riskStore = db.createObjectStore(STORES.riskAssessments, { keyPath: "id" });
            riskStore.createIndex("clientCode", "clientCode", { unique: false });
            riskStore.createIndex("assessDate", "assessDate", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.goals)) {
            const goalStore = db.createObjectStore(STORES.goals, { keyPath: "id" });
            goalStore.createIndex("clientCode", "clientCode", { unique: false });
            goalStore.createIndex("status", "status", { unique: false });
          }
        }

        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(STORES.caseRecords)) {
            const caseStore = db.createObjectStore(STORES.caseRecords, { keyPath: "id" });
            caseStore.createIndex("clientCode", "clientCode", { unique: false });
            caseStore.createIndex("createdAt", "createdAt", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.meta)) {
            db.createObjectStore(STORES.meta, { keyPath: "key" });
          }
        }

        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(STORES.crisisWarnings)) {
            const cwStore = db.createObjectStore(STORES.crisisWarnings, { keyPath: "id" });
            cwStore.createIndex("clientCode", "clientCode", { unique: false });
            cwStore.createIndex("status", "status", { unique: false });
            cwStore.createIndex("createdAt", "createdAt", { unique: false });
          }
        }

        if (transaction) {
          transaction.oncomplete = () => {
            console.info(`[DB] 数据库升级完成: v${DB_VERSION}`);
          };
          transaction.onerror = (e) => {
            console.error("[DB] 数据库升级失败:", e);
            emit("error", (e.target as IDBRequest).error);
          };
        }
      } catch (e) {
        console.error("[DB] 数据库升级过程出错:", e);
        emit("error", e);
        reject(e);
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        console.warn("[DB] 数据库版本变更，将关闭连接");
        db.close();
        emit("upgrade", { reason: "versionchange" });
      };

      db.onclose = () => {
        console.info("[DB] 数据库连接已关闭");
      };

      db.onerror = (e) => {
        console.error("[DB] 数据库错误:", e);
        const target = e.target as IDBRequest;
        emit("error", target.error || new Error("数据库错误"));
      };

      emit("success", { version: DB_VERSION });
      resolve(db);
    };

    request.onerror = () => {
      const error = request.error || new Error("数据库打开失败");
      console.error("[DB] 打开数据库失败:", error);
      emit("error", error);
      reject(error);
    };

    request.onblocked = () => {
      const error = new Error("数据库升级被阻塞，请关闭其他标签页后刷新");
      console.warn("[DB]", error.message);
      emit("blocked", error);
      reject(error);
    };
  });
}

function txReadWrite(db: IDBDatabase, storeName: StoreName | StoreName[]): IDBTransaction {
  return db.transaction(storeName, "readwrite");
}

function txReadOnly(db: IDBDatabase, storeName: StoreName | StoreName[]): IDBTransaction {
  return db.transaction(storeName, "readonly");
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(wrapDBError(request.error, "数据库操作失败"));
  });
}

function promisifyVoidRequest(request: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(wrapDBError(request.error, "数据库操作失败"));
  });
}

function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapDBError(tx.error, "事务执行失败"));
    tx.onabort = () => reject(wrapDBError(tx.error, "事务被中止"));
  });
}

function wrapDBError(error: unknown, defaultMessage: string): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === "object") {
    const errObj = error as { name?: string; message?: string };
    const name = errObj.name || "";
    let message = defaultMessage;
    if (name === "QuotaExceededError") {
      message = "浏览器存储空间已满，请清理数据后重试";
    } else if (name === "VersionError") {
      message = "数据库版本不兼容，请刷新页面";
    } else if (name === "NotFoundError") {
      message = "数据不存在或已被删除";
    } else if (errObj.message) {
      message = errObj.message;
    }
    return new Error(message);
  }
  return new Error(defaultMessage);
}

function getAllFromStore<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
  const store = txReadOnly(db, storeName).objectStore(storeName);
  return promisifyRequest<T[]>(store.getAll());
}

function putToStore<T>(db: IDBDatabase, storeName: StoreName, item: T): Promise<void> {
  const store = txReadWrite(db, storeName).objectStore(storeName);
  return promisifyVoidRequest(store.put(item));
}

function deleteFromStore(db: IDBDatabase, storeName: StoreName, id: string): Promise<void> {
  const store = txReadWrite(db, storeName).objectStore(storeName);
  return promisifyVoidRequest(store.delete(id));
}

function clearStore(db: IDBDatabase, storeName: StoreName): Promise<void> {
  const store = txReadWrite(db, storeName).objectStore(storeName);
  return promisifyVoidRequest(store.clear());
}

async function getMeta<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  const store = txReadOnly(db, STORES.meta).objectStore(STORES.meta);
  const result = await promisifyRequest<{ key: string; value: T } | undefined>(store.get(key));
  return result?.value;
}

async function setMeta<T>(db: IDBDatabase, key: string, value: T): Promise<void> {
  const store = txReadWrite(db, STORES.meta).objectStore(STORES.meta);
  await promisifyVoidRequest(store.put({ key, value }));
}

export async function getDBStatus(): Promise<DBStatus> {
  const isSupported = checkDBSupport();
  if (!isSupported) {
    return { isSupported: false, isConnected: false, version: 0, error: "浏览器不支持 IndexedDB" };
  }
  try {
    const db = await openDB();
    const version = db.version;
    db.close();
    return { isSupported: true, isConnected: true, version };
  } catch (e) {
    return {
      isSupported: true,
      isConnected: false,
      version: 0,
      error: e instanceof Error ? e.message : "数据库连接失败"
    };
  }
}

export async function loadAllData(
  sampleTimeline: TimelineRecord[],
  sampleRisk: RiskAssessment[],
  sampleGoals: InterventionGoal[],
  sampleCaseRecords: CaseRecord[],
  sampleCrisisWarnings: CrisisWarning[],
  sampleNextTimelineId: number,
  sampleNextRiskId: number,
  sampleNextGoalId: number,
  sampleNextCaseRecordId: number,
  sampleNextCrisisWarningId: number
): Promise<AppData> {
  const db = await openDB();

  try {
    const [timeline, riskAssessments, goals, caseRecords, crisisWarnings, seeded] = await Promise.all([
      getAllFromStore<TimelineRecord>(db, STORES.timeline),
      getAllFromStore<RiskAssessment>(db, STORES.riskAssessments),
      getAllFromStore<InterventionGoal>(db, STORES.goals),
      getAllFromStore<CaseRecord>(db, STORES.caseRecords),
      getAllFromStore<CrisisWarning>(db, STORES.crisisWarnings),
      getMeta<boolean>(db, "seeded"),
    ]);

    const isEmpty = timeline.length === 0 && riskAssessments.length === 0
      && goals.length === 0 && caseRecords.length === 0;

    if (isEmpty && !seeded) {
      console.info("[DB] 检测到空库，正在加载示例数据...");
      await seedSampleData(
        db,
        sampleTimeline,
        sampleRisk,
        sampleGoals,
        sampleCaseRecords,
        sampleCrisisWarnings,
        sampleNextTimelineId,
        sampleNextRiskId,
        sampleNextGoalId,
        sampleNextCaseRecordId,
        sampleNextCrisisWarningId
      );
      await setMeta(db, "seeded", true);
      await setMeta(db, "seededAt", new Date().toISOString());
      db.close();
      return {
        timeline: sampleTimeline,
        riskAssessments: sampleRisk,
        goals: sampleGoals,
        caseRecords: sampleCaseRecords,
        crisisWarnings: sampleCrisisWarnings,
        nextTimelineId: sampleNextTimelineId,
        nextRiskId: sampleNextRiskId,
        nextGoalId: sampleNextGoalId,
        nextCaseRecordId: sampleNextCaseRecordId,
        nextCrisisWarningId: sampleNextCrisisWarningId,
      };
    }

    const [nextTimelineId, nextRiskId, nextGoalId, nextCaseRecordId, nextCrisisWarningId] = await Promise.all([
      getMeta<number>(db, "nextTimelineId"),
      getMeta<number>(db, "nextRiskId"),
      getMeta<number>(db, "nextGoalId"),
      getMeta<number>(db, "nextCaseRecordId"),
      getMeta<number>(db, "nextCrisisWarningId"),
    ]);

    db.close();
    return {
      timeline,
      riskAssessments,
      goals,
      caseRecords,
      crisisWarnings,
      nextTimelineId: nextTimelineId ?? sampleNextTimelineId,
      nextRiskId: nextRiskId ?? sampleNextRiskId,
      nextGoalId: nextGoalId ?? sampleNextGoalId,
      nextCaseRecordId: nextCaseRecordId ?? sampleNextCaseRecordId,
      nextCrisisWarningId: nextCrisisWarningId ?? sampleNextCrisisWarningId,
    };
  } catch (e) {
    db.close();
    throw e;
  }
}

async function seedSampleData(
  db: IDBDatabase,
  timeline: TimelineRecord[],
  risk: RiskAssessment[],
  goals: InterventionGoal[],
  caseRecords: CaseRecord[],
  crisisWarnings: CrisisWarning[],
  nextTimelineId: number,
  nextRiskId: number,
  nextGoalId: number,
  nextCaseRecordId: number,
  nextCrisisWarningId: number
): Promise<void> {
  const tx = db.transaction(
    [STORES.timeline, STORES.riskAssessments, STORES.goals, STORES.caseRecords, STORES.crisisWarnings, STORES.meta],
    "readwrite"
  );

  const tlStore = tx.objectStore(STORES.timeline);
  timeline.forEach(r => tlStore.put(r));

  const riskStore = tx.objectStore(STORES.riskAssessments);
  risk.forEach(r => riskStore.put(r));

  const goalStore = tx.objectStore(STORES.goals);
  goals.forEach(g => goalStore.put(g));

  const caseStore = tx.objectStore(STORES.caseRecords);
  caseRecords.forEach(c => caseStore.put(c));

  const cwStore = tx.objectStore(STORES.crisisWarnings);
  crisisWarnings.forEach(c => cwStore.put(c));

  const metaStore = tx.objectStore(STORES.meta);
  metaStore.put({ key: "nextTimelineId", value: nextTimelineId });
  metaStore.put({ key: "nextRiskId", value: nextRiskId });
  metaStore.put({ key: "nextGoalId", value: nextGoalId });
  metaStore.put({ key: "nextCaseRecordId", value: nextCaseRecordId });
  metaStore.put({ key: "nextCrisisWarningId", value: nextCrisisWarningId });
  metaStore.put({ key: "seeded", value: true });
  metaStore.put({ key: "seededAt", value: new Date().toISOString() });
  metaStore.put({ key: "dbVersion", value: DB_VERSION });

  await promisifyTransaction(tx);
  console.info("[DB] 示例数据加载完成");
}

export async function saveTimelineRecord(record: TimelineRecord): Promise<void> {
  const db = await openDB();
  try {
    await putToStore(db, STORES.timeline, record);
  } finally {
    db.close();
  }
}

export async function saveTimelineRecords(records: TimelineRecord[]): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(STORES.timeline, "readwrite");
    const store = tx.objectStore(STORES.timeline);
    records.forEach(r => store.put(r));
    await promisifyTransaction(tx);
  } finally {
    db.close();
  }
}

export async function deleteTimelineRecord(id: string): Promise<void> {
  const db = await openDB();
  try {
    await deleteFromStore(db, STORES.timeline, id);
  } finally {
    db.close();
  }
}

export async function saveRiskAssessment(assessment: RiskAssessment): Promise<void> {
  const db = await openDB();
  try {
    await putToStore(db, STORES.riskAssessments, assessment);
  } finally {
    db.close();
  }
}

export async function saveRiskAssessments(assessments: RiskAssessment[]): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(STORES.riskAssessments, "readwrite");
    const store = tx.objectStore(STORES.riskAssessments);
    assessments.forEach(a => store.put(a));
    await promisifyTransaction(tx);
  } finally {
    db.close();
  }
}

export async function deleteRiskAssessment(id: string): Promise<void> {
  const db = await openDB();
  try {
    await deleteFromStore(db, STORES.riskAssessments, id);
  } finally {
    db.close();
  }
}

export async function saveGoal(goal: InterventionGoal): Promise<void> {
  const db = await openDB();
  try {
    await putToStore(db, STORES.goals, goal);
  } finally {
    db.close();
  }
}

export async function saveGoals(goals: InterventionGoal[]): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(STORES.goals, "readwrite");
    const store = tx.objectStore(STORES.goals);
    goals.forEach(g => store.put(g));
    await promisifyTransaction(tx);
  } finally {
    db.close();
  }
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await openDB();
  try {
    await deleteFromStore(db, STORES.goals, id);
  } finally {
    db.close();
  }
}

export async function saveCaseRecord(record: CaseRecord): Promise<void> {
  const db = await openDB();
  try {
    await putToStore(db, STORES.caseRecords, record);
  } finally {
    db.close();
  }
}

export async function saveCaseRecords(records: CaseRecord[]): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(STORES.caseRecords, "readwrite");
    const store = tx.objectStore(STORES.caseRecords);
    records.forEach(r => store.put(r));
    await promisifyTransaction(tx);
  } finally {
    db.close();
  }
}

export async function deleteCaseRecord(id: string): Promise<void> {
  const db = await openDB();
  try {
    await deleteFromStore(db, STORES.caseRecords, id);
  } finally {
    db.close();
  }
}

export async function saveCrisisWarning(warning: CrisisWarning): Promise<void> {
  const db = await openDB();
  try {
    await putToStore(db, STORES.crisisWarnings, warning);
  } finally {
    db.close();
  }
}

export async function saveCrisisWarnings(warnings: CrisisWarning[]): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(STORES.crisisWarnings, "readwrite");
    const store = tx.objectStore(STORES.crisisWarnings);
    warnings.forEach(w => store.put(w));
    await promisifyTransaction(tx);
  } finally {
    db.close();
  }
}

export async function deleteCrisisWarning(id: string): Promise<void> {
  const db = await openDB();
  try {
    await deleteFromStore(db, STORES.crisisWarnings, id);
  } finally {
    db.close();
  }
}

export async function saveCounters(
  nextTimelineId: number,
  nextRiskId: number,
  nextGoalId: number,
  nextCaseRecordId: number,
  nextCrisisWarningId: number
): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(STORES.meta, "readwrite");
    const store = tx.objectStore(STORES.meta);
    store.put({ key: "nextTimelineId", value: nextTimelineId });
    store.put({ key: "nextRiskId", value: nextRiskId });
    store.put({ key: "nextGoalId", value: nextGoalId });
    store.put({ key: "nextCaseRecordId", value: nextCaseRecordId });
    store.put({ key: "nextCrisisWarningId", value: nextCrisisWarningId });
    await promisifyTransaction(tx);
  } finally {
    db.close();
  }
}

export async function clearAllData(): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(
      [STORES.timeline, STORES.riskAssessments, STORES.goals, STORES.caseRecords, STORES.crisisWarnings, STORES.meta],
      "readwrite"
    );
    [STORES.timeline, STORES.riskAssessments, STORES.goals, STORES.caseRecords, STORES.crisisWarnings, STORES.meta]
      .forEach(storeName => tx.objectStore(storeName).clear());
    await promisifyTransaction(tx);
    console.info("[DB] 所有数据已清空");
  } finally {
    db.close();
  }
}

export async function resetToSampleData(
  sampleTimeline: TimelineRecord[],
  sampleRisk: RiskAssessment[],
  sampleGoals: InterventionGoal[],
  sampleCaseRecords: CaseRecord[],
  sampleCrisisWarnings: CrisisWarning[],
  sampleNextTimelineId: number,
  sampleNextRiskId: number,
  sampleNextGoalId: number,
  sampleNextCaseRecordId: number,
  sampleNextCrisisWarningId: number
): Promise<AppData> {
  await clearAllData();
  const db = await openDB();
  try {
    await seedSampleData(
      db,
      sampleTimeline,
      sampleRisk,
      sampleGoals,
      sampleCaseRecords,
      sampleCrisisWarnings,
      sampleNextTimelineId,
      sampleNextRiskId,
      sampleNextGoalId,
      sampleNextCaseRecordId,
      sampleNextCrisisWarningId
    );
    return {
      timeline: sampleTimeline,
      riskAssessments: sampleRisk,
      goals: sampleGoals,
      caseRecords: sampleCaseRecords,
      crisisWarnings: sampleCrisisWarnings,
      nextTimelineId: sampleNextTimelineId,
      nextRiskId: sampleNextRiskId,
      nextGoalId: sampleNextGoalId,
      nextCaseRecordId: sampleNextCaseRecordId,
      nextCrisisWarningId: sampleNextCrisisWarningId,
    };
  } finally {
    db.close();
  }
}

export function isSaveError(error: unknown): boolean {
  if (error instanceof DOMException) return true;
  if (error instanceof Error) {
    return error.message.includes("数据库") ||
      error.message.includes("存储") ||
      error.message.includes("空间") ||
      error.message.includes("IndexedDB");
  }
  return false;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

export async function loadCrisisStrategy(defaultStrategy: CrisisStrategy): Promise<CrisisStrategy> {
  const db = await openDB();
  try {
    const saved = await getMeta<CrisisStrategy>(db, "crisisStrategy");
    return saved || defaultStrategy;
  } finally {
    db.close();
  }
}

export async function saveCrisisStrategy(strategy: CrisisStrategy): Promise<void> {
  const db = await openDB();
  try {
    await setMeta(db, "crisisStrategy", strategy);
  } finally {
    db.close();
  }
}

export interface ExportedBackupData {
  caseRecords: CaseRecord[];
  timeline: TimelineRecord[];
  riskAssessments: RiskAssessment[];
  goals: InterventionGoal[];
  crisisWarnings: CrisisWarning[];
  meta: {
    nextTimelineId: number;
    nextRiskId: number;
    nextGoalId: number;
    nextCaseRecordId: number;
    nextCrisisWarningId: number;
    seeded?: boolean;
    seededAt?: string;
    dbVersion: number;
    [key: string]: unknown;
  };
}

export async function exportAllDataForBackup(): Promise<ExportedBackupData> {
  const db = await openDB();

  try {
    const [
      caseRecords,
      timeline,
      riskAssessments,
      goals,
      crisisWarnings,
      nextTimelineId,
      nextRiskId,
      nextGoalId,
      nextCaseRecordId,
      nextCrisisWarningId,
      seeded,
      seededAt,
    ] = await Promise.all([
      getAllFromStore<CaseRecord>(db, STORES.caseRecords),
      getAllFromStore<TimelineRecord>(db, STORES.timeline),
      getAllFromStore<RiskAssessment>(db, STORES.riskAssessments),
      getAllFromStore<InterventionGoal>(db, STORES.goals),
      getAllFromStore<CrisisWarning>(db, STORES.crisisWarnings),
      getMeta<number>(db, "nextTimelineId"),
      getMeta<number>(db, "nextRiskId"),
      getMeta<number>(db, "nextGoalId"),
      getMeta<number>(db, "nextCaseRecordId"),
      getMeta<number>(db, "nextCrisisWarningId"),
      getMeta<boolean>(db, "seeded"),
      getMeta<string>(db, "seededAt"),
    ]);

    return {
      caseRecords,
      timeline,
      riskAssessments,
      goals,
      crisisWarnings,
      meta: {
        nextTimelineId: nextTimelineId ?? 1,
        nextRiskId: nextRiskId ?? 1,
        nextGoalId: nextGoalId ?? 1,
        nextCaseRecordId: nextCaseRecordId ?? 1,
        nextCrisisWarningId: nextCrisisWarningId ?? 1,
        seeded,
        seededAt,
        dbVersion: DB_VERSION,
      },
    };
  } finally {
    db.close();
  }
}

export interface ImportResult {
  success: boolean;
  error?: string;
  importedCounts: {
    caseRecords: number;
    timeline: number;
    riskAssessments: number;
    goals: number;
    crisisWarnings: number;
  };
}

export async function importBackupDataAtomically(
  data: ExportedBackupData,
  mode: "merge" | "overwrite" = "merge"
): Promise<ImportResult> {
  const db = await openDB();

  try {
    const tx = db.transaction(
      [
        STORES.caseRecords,
        STORES.timeline,
        STORES.riskAssessments,
        STORES.goals,
        STORES.crisisWarnings,
        STORES.meta,
      ],
      "readwrite"
    );

    const caseStore = tx.objectStore(STORES.caseRecords);
    const timelineStore = tx.objectStore(STORES.timeline);
    const riskStore = tx.objectStore(STORES.riskAssessments);
    const goalStore = tx.objectStore(STORES.goals);
    const cwStore = tx.objectStore(STORES.crisisWarnings);
    const metaStore = tx.objectStore(STORES.meta);

    let caseCount = 0;
    let timelineCount = 0;
    let riskCount = 0;
    let goalCount = 0;
    let cwCount = 0;

    if (mode === "overwrite") {
      caseStore.clear();
      timelineStore.clear();
      riskStore.clear();
      goalStore.clear();
      cwStore.clear();
    }

    data.caseRecords.forEach(r => {
      caseStore.put(r);
      caseCount++;
    });

    data.timeline.forEach(r => {
      timelineStore.put(r);
      timelineCount++;
    });

    data.riskAssessments.forEach(r => {
      riskStore.put(r);
      riskCount++;
    });

    data.goals.forEach(g => {
      goalStore.put(g);
      goalCount++;
    });

    data.crisisWarnings.forEach(w => {
      cwStore.put(w);
      cwCount++;
    });

    if (data.meta) {
      const metaKeys = [
        "nextTimelineId",
        "nextRiskId",
        "nextGoalId",
        "nextCaseRecordId",
        "nextCrisisWarningId",
        "seeded",
        "seededAt",
        "dbVersion",
      ];

      for (const key of metaKeys) {
        if (key in data.meta && data.meta[key] !== undefined) {
          metaStore.put({ key, value: data.meta[key] });
        }
      }
    }

    await promisifyTransaction(tx);

    return {
      success: true,
      importedCounts: {
        caseRecords: caseCount,
        timeline: timelineCount,
        riskAssessments: riskCount,
        goals: goalCount,
        crisisWarnings: cwCount,
      },
    };
  } catch (e) {
    console.error("[DB] 数据导入失败，事务已回滚:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "未知错误",
      importedCounts: {
        caseRecords: 0,
        timeline: 0,
        riskAssessments: 0,
        goals: 0,
        crisisWarnings: 0,
      },
    };
  } finally {
    db.close();
  }
}
