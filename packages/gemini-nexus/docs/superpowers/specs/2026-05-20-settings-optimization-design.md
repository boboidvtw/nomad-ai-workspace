# 2026-05-20 Gemini-Nexus 设置界面全面优化设计 Spec

本设计 spec 专注于对 Gemini-Nexus 项目设置界面的**微观质量优化**（微观代码可读性、命名规范、文件组织结构和样式整洁度）。

遵循“只分析，不直接修改代码”的原则，本 Spec 提供全方位的微观优化方案，包括微观代码坏味道分析、重构路径以及文件组织规范。

---

## 1. 现状微观分析与代码坏味道 (Micro-level Smell Analysis)

通过对 `settings/index.js`、`SettingsController`、`SettingsView` 以及各 HTML/CSS 文件的细致走读，发现以下 **15 个** 微观代码问题，按优先级从高到低分类如下：

### A. 文件结构与命名不一致性 (File Structure & Naming) — 共 4 处

1. **测试文件归属需明确**：`css/settings_layout.test.js` 是专门保护设置页 CSS 布局约束的回归测试，保留在 `css/` 目录下可以让测试和样式所有权并列，避免把纯样式约束散落到不相关测试目录。
2. **连接配置工具命名含糊**：`sandbox/ui/settings/sections/connection_utils.js` 内部不仅处理了数据转换（如 headers 解析），还包含了不纯粹的副作用。
3. **样式文件职责重叠**：`settings.css` 和 `settings_controls.css` 划分边界模糊。例如，`.shortcut-input`（控件）定义在 `settings.css` 中，而一部分模态框布局却定义在 `settings_controls.css` 中。
4. **子视图导入方式混杂**：在 `view.js` 中同时使用了相对路径与别名路径混杂的倾向，应该统一为一贯的相对路径规范。

### B. 微观代码可读性与硬编码 (Readability & Hardcoding) — 共 5 处

5. **DOM 选择器与魔术字符串耦合**：`view.js` 的 `queryElements()` 中大量使用硬编码的字符串字面量（如 `'settings-modal'`, `'close-settings'`, `'save-shortcuts'`, `'reset-shortcuts'`），一旦 HTML 模板变更极易引发静默失效。
6. **无保护的深层解构**：在 `connection.js` 的 `setData(data)` 中，直接对 `data` 进行字段提取。若传入的 `data` 为 `null` 或未定义，将会触发运行时崩溃。
7. **缺乏类型防御的数字转换**：`SettingsController` 的 `normalizeRecentTurns` 虽有处理，但在 `GeneralSection.getData()` 中收集 input 值时，仍直接读取 `contextRecentTurnsInput.value` 而未在 UI 层做输入合法性拦截。
8. **魔术过渡时间与阴影值**：`css/settings.css` 中大量存在如 `box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);` 和 `transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1)` 等硬编码的阴影与动画贝塞尔曲线，未归入 CSS 变量统一管理。
9. **随机 ID 生成需归口**：`connection.js` 中的 `_makeServerId()` 应委托给可读的 `createMcpServerId()`，并进一步复用共享的 `createPrefixedId('srv')`，避免在设置分栏里散落临时随机算法：
    ```javascript
    export function createMcpServerId() {
        return createPrefixedId('srv');
    }
    ```
    这样能让 ID 目的（MCP server 关联标识）和随机生成细节分离。

### C. 组件生命周期与内存泄漏风险 (Lifecycle & Memory Leak) — 共 3 处

10. **自定义工具移除时的事件孤儿**：在 `general.js` 的 `addCustomSelectionToolRow` 中，临时创建的 `remove` 按钮绑定了事件监听器。在执行 `row.remove()` 销毁 DOM 时，如果没有手动解绑或显式销毁事件，部分浏览器引擎下存在内存泄漏风险。
11. **全局事件监听未注销**：`view.js` 在 `bindEvents` 中执行了 `document.addEventListener('keydown', ...)`。当设置页模态框从 DOM 树卸载或隐藏时，此全局 Keydown 监听器依然存活。
12. **跨页面/跨域通信事件滥用**：`SettingsController` 构造函数中直接向 `window` 注册了 `message` 监听器，用来捕获 `BACKGROUND_MESSAGE`。缺乏对 `origin` 的基本安全校验。

### D. 国际化(i18n) 与模板噪声 (i18n & Template Quality) — 共 3 处

13. **占位符本地化双重定义风险**：在 HTML 模板中，凡是使用 `data-i18n-placeholder` 的控件，都不应同时写静态 `placeholder` 文本。否则 `applyTranslations()` 因异步加载延迟时，可能导致瞬间的界面文本抖动。
14. **HTML 块魔术嵌套**：`SettingsContentTemplate` 的拼接逻辑散落在多个 `.js` 文件里。将 HTML 标记与 JS 代码高度耦合，使得静态语法着色和格式化工具（Prettier）无法完美解析。
15. **多余的注释和冗余的状态回写**：`SettingsController` 中对 `useOfficialApi` 进行了向后兼容回写，但缺乏明确的 `// DEPRECATED` 标记。

---

## 2. 优化方案：重构方案与推荐路径

针对上述微观代码坏味道，我们提出 **2 种优化设计 approach**。

### Approach A：渐进式代码提炼与规范重整 (推荐)

- **核心思想**：在**不改变现有架构和状态流**的前提下，对设置界面的所有文件进行一次深度的代码洁净化重构。
- **具体做法**：
    1. **目录结构归正**：保留 `css/settings_layout.test.js` 作为 CSS 布局回归测试，并用结构测试记录这一所有权约定。
    2. **消除硬编码与魔法值**：将 CSS 中的过渡效果、阴影提取为 `--settings-transition-speed`、`--settings-shadow-depth` 变量。
    3. **增强生命周期防御**：使用事件委托（Event Delegation）处理自定义工具的“删除”按钮，避免在每个子行单独绑定匿名监听器，彻底杜绝内存泄漏。
    4. **抽取 DOM Keys**：集中声明 DOM ID 常量，避免在 UI 逻辑中随意散布 `'settings-modal'` 等魔术字符串。
- **优点**：改动风险极低，完全向后兼容，能立即显著提升可读性。

### Approach B：声明式表单与微组件化重构

- **核心思想**：彻底改变现有的“手动 queryElements + 手动 bindEvents”底层交互模式，引入轻量级的声明式绑定或将表单划分为更小的原生 Web Components。
- **优点**：代码量可大幅精简，消除手动 DOM 操作。
- **缺点**：对于当前纯原生 JS 架构的 Chrome 插件，过度组件化会引入不必要的概念层和重构成本，不符合 **YAGNI**（你不需要它）原则。

> **推荐结论**：选择 **Approach A**。这高度契合“微观代码质量优化”的目标，通过高标准的细节打磨，使现有代码焕然一新，而不引入多余的架构复杂性。

---

## 3. 详细设计与重构细节 (Approach A 细化)

### 3.1 目录组织与命名规整

重构后的文件应当严格按照如下微观结构组织：

```text
Gemini-Nexus/
├── css/
│   ├── settings.css             # 仅存放设置页的基础分栏布局、模态框框架样式
│   └── settings_controls.css    # 仅存放输入框、下拉框、Switch、Shortcut、Radio 等通用控件样式
├── sandbox/
│   └── ui/
│       └── settings/
│           ├── constants.js     # 新增：存放所有 DOM ID、事件名称、配置边界常量
│           ├── index.js         # SettingsController
│           ├── view.js          # SettingsView (仅负责 Tab 切换与模态框状态)
│           └── sections/        # 各分栏具体逻辑
│               ├── connection.js
│               ├── general.js
│               ...
└── css/
    └── settings_layout.test.js # 设置布局 CSS 回归测试
```

### 3.2 关键微观代码重构伪代码设计

#### 1. 消除内存泄漏：采用“事件委托”替代“子行事件绑定”

在 `GeneralSection` (`sandbox/ui/settings/sections/general.js`) 中：

- **重构前**：
  在 `addCustomSelectionToolRow` 内部，针对每次动态生成的 remove button 都会执行：
  `remove.addEventListener('click', () => row.remove())`。
- **重构后**：
  只在父容器 `customSelectionToolsList` 上绑定一次事件监听：
    ```javascript
    // sandbox/ui/settings/sections/general.js
    bindEvents() {
        const { customSelectionToolsList } = this.elements;
        if (customSelectionToolsList) {
            customSelectionToolsList.addEventListener('click', (event) => {
                const removeBtn = event.target.closest('.custom-selection-tool-remove');
                if (removeBtn) {
                    const row = removeBtn.closest('.custom-selection-tool-row');
                    if (row) row.remove();
                }
            });
        }
    }
    ```

#### 2. 全局事件的注册与销毁 (防御性编程)

在 `SettingsView` (`sandbox/ui/settings/view.js`) 中：

- **重构前**：直接在 `document` 上注册 `keydown`，在 modal 关闭时从不销毁。
- **重构后**：

    ```javascript
    // sandbox/ui/settings/view.js
    constructor(callbacks) {
        ...
        this.handleEscapeKey = this.handleEscapeKey.bind(this);
    }

    handleEscapeKey(e) {
        if (e.key === 'Escape' && this.elements.modal?.classList.contains('visible')) {
            this.close();
        }
    }

    open() {
        this.elements.modal?.classList.add('visible');
        document.addEventListener('keydown', this.handleEscapeKey);
    }

    close() {
        this.elements.modal?.classList.remove('visible');
        document.removeEventListener('keydown', this.handleEscapeKey);
    }
    ```

#### 3. 统一 DOM 常量声明

新建 `sandbox/ui/settings/constants.js`：

```javascript
export const DOM_IDS = {
    MODAL: 'settings-modal',
    BTN_CLOSE: 'close-settings',
    BTN_SAVE: 'save-shortcuts',
    BTN_RESET: 'reset-shortcuts',
    PROVIDER_SELECT: 'provider-select',
    // ...
};

export const SETTINGS_LIMITS = {
    MIN_TURNS: 1,
    MAX_TURNS: 50,
};
```

---

## 4. 自我评测与健壮性校验 (Self-Review Checklist)

1. **是否有占位符遗留 (TBD/TODO)**：本 spec 均已明确具体设计细节，不存在任何 "TBD" 或 "TODO"。
2. **是否存在内部冲突**：重构设计严格保持了向后兼容的 JS 纯原生接口，事件委托设计完全兼容 `getCustomSelectionTools` 方法。
3. **范围控制**：优化完全局限在 `settings` 功能包下，不影响 `background` 核心调度层。
4. **歧义校验**：明确限定了 CSS 拆分职责，避免重构后样式覆盖优先级产生冲突。
