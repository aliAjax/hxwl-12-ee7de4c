# hxwl-12 心理咨询个案记录

会谈时间线、风险等级与干预目标记录

## 技术栈

React + Vite + TypeScript + CSS

## 本地运行

```bash
npm install
npm run dev
```

开发端口：5112

## 初始功能

- 领域指标看板
- 角色和分类筛选
- 专业字段录入区
- 示例记录列表
- 可继续扩展IndexedDB、权限、后端API和复杂图表

## 高风险数据流程说明

项目内置以下涉及敏感用户数据的核心流程，均有对应的测试覆盖：

| 模块 | 文件 | 说明 | 风险点 |
|------|------|------|--------|
| IndexedDB 存储 | [db.ts](src/db.ts) | 所有业务数据持久化 | 数据损坏、版本迁移 |
| 审计日志 | [auditLog.ts](src/auth/auditLog.ts) | 所有操作写入 localStorage | 权限绕过、日志篡改 |
| 导出历史 | [exportHistory.ts](src/utils/exportHistory.ts) | 每次导出记录到 localStorage | 数据泄露、权限越级 |
| 数据脱敏 | [desensitize.ts](src/utils/desensitize.ts) | 身份证/手机号/姓名识别与遮蔽 | 漏脱敏、过度脱敏 |
| 备份导出 | [backupImport.ts](src/utils/backupImport.ts) | 全量数据打包下载 | 数据完整性、校验和 |
| 备份导入 | [backupImport.ts](src/utils/backupImport.ts) | 外部文件全量恢复 | 恶意文件、数据污染 |
| 权限控制 | [permissions.ts](src/auth/permissions.ts) | 三角色权限矩阵 | 越权访问 |
| 数据过滤 | [dataFilter.ts](src/auth/dataFilter.ts) | 按角色过滤数据视图 | 敏感字段泄露 |

---

## 质量检查流程

日常开发和提交代码前，请按以下步骤执行质量检查。所有流程均可在**无真实浏览器用户数据**的 CI 环境中稳定运行。

### 1. 一键全量检查（提交前必跑）

```bash
npm run quality
```

该命令会依次执行：**类型检查 → 构建验证 → 单元测试**。三个步骤任何一个失败都会立即终止并返回非零退出码。

CI 环境使用相同的命令：`npm run ci`（别名，与 `quality` 等价）。

---

### 2. 分步检查命令

#### 类型检查

```bash
npm run typecheck
```

- 基于 `tsc --noEmit`，仅做类型静态分析，不产出文件
- 严格模式已启用（`strict: true`）
- 覆盖 `src/` 和 `tests/` 目录
- 常见问题：
  - 新增全局类型需在 `tsconfig.json` 的 `types` 字段声明
  - 测试文件需符合 Vitest 全局 API 约定（已配置 `vitest/globals`）

#### 构建验证

```bash
npm run build
```

- 基于 Vite 生产构建
- 验证所有模块能正确打包，无未解析引用
- 产物输出到 `dist/` 目录
- 该步骤同时验证：
  - 所有 `.tsx` / `.ts` 文件的 JSX 转换正确
  - CSS 资源打包无冲突
  - 第三方依赖 tree-shaking 无异常

#### 单元测试

```bash
npm run test          # 单次运行
npm run test:watch    # 监听模式（开发时使用）
npm run test:coverage # 生成覆盖率报告
```

测试环境特性：
- 使用 **jsdom** 模拟浏览器环境（`localStorage`、`navigator` 均已 mock）
- 每个测试用例前自动清空 localStorage，保证用例间完全隔离
- 无需真实 IndexedDB 或浏览器即可运行

---

### 3. 测试覆盖的关键纯函数

| 测试文件 | 覆盖模块 | 核心测试点 |
|----------|----------|------------|
| [backupImport.test.ts](tests/backupImport.test.ts) | 备份导入导出 | 文件结构校验、校验和、版本兼容、敏感字段识别、冲突预览、三种导入模式 |
| [permissions.test.ts](tests/permissions.test.ts) | 权限系统 | 三角色权限矩阵、字段可见性、菜单可见性、批量校验、断言/守护函数 |
| [auditLog.test.ts](tests/auditLog.test.ts) | 审计日志 | 多维度过滤、统计聚合、批量合并、快照备份与恢复 |
| [exportHistory.test.ts](tests/exportHistory.test.ts) | 导出历史 | 过滤、统计、CRUD 操作 |
| [summaryGenerator.test.ts](tests/summaryGenerator.test.ts) | 报告生成 | 五段式摘要、督导草稿、多种导出范围、脱敏输出 |
| [dataFilter.test.ts](tests/dataFilter.test.ts) | 数据过滤 | 三角色数据视图、活跃来访者提取、菜单访问权限 |

---

### 4. 本地调试建议

1. **开发时 TDD 流程**：运行 `npm run test:watch`，修改代码后自动重跑相关测试
2. **调试失败用例**：使用 `it.only` 临时聚焦单个测试
3. **覆盖率检查**：`npm run test:coverage` 后打开 `coverage/html/index.html` 查看详细报告
4. **提交前检查**：`npm run quality` 全量通过后再提交

---

## GitHub Actions CI

配置文件位于 [.github/workflows/ci.yml](.github/workflows/ci.yml)，自动在以下场景触发：

- `push` 到 `main` / `master` / `develop` 分支
- 所有向上述分支的 Pull Request
- 手动触发（workflow_dispatch）

### CI 执行步骤

| 阶段 | 说明 |
|------|------|
| Checkout | 拉取代码 |
| Setup Node | 使用 Node.js 20.x + npm 缓存 |
| Install | `npm ci` 安装依赖 |
| Step 1 - Typecheck | `npm run typecheck` |
| Step 2 - Build | `npm run build` + 构建缓存 |
| Step 3 - Test | `npm run test` |
| Coverage (可选) | 生成并上传覆盖率 Artifact（保留 7 天） |
| Build Artifact (可选) | 上传 `dist/` 构建产物（保留 7 天） |

任何一步失败均会导致 CI 失败并阻止 PR 合并。

---

## 附录：环境配置文件一览

| 文件 | 作用 |
|------|------|
| [tsconfig.json](tsconfig.json) | TypeScript 严格模式配置，包含 src/tests 目录 |
| [vitest.config.ts](vitest.config.ts) | Vitest + jsdom 环境，覆盖率目标范围 |
| [tests/setup.ts](tests/setup.ts) | 测试启动钩子：mock localStorage / navigator，全局清理 |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | GitHub Actions CI 流水线 |
| [vite.config.ts](vite.config.ts) | Vite 开发/构建配置 |
