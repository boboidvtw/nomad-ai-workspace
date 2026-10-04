# Gemini-Nexus 设置界面全面微观重构与质量提升计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于已验证的 `2026-05-20-settings-optimization-design.md` 设计规范，对 Gemini-Nexus 项目的设置界面进行全方位的微观质量优化，重点清除事件侦听器泄漏、魔术字符串耦合、硬编码 CSS 变量，并规范文件组织结构。

**Architecture:** 本次优化不改变现有的数据流或逻辑结构，完全保持原有业务功能。通过封装 `constants.js`、利用“事件委托”改造动态控件生命周期、在模态框 `open`/`close` 时精密控制全局事件的绑定与解绑，以及精简和变量化样式文件，消除潜在的性能与可维护性隐患。

**Tech Stack:** Vanilla JavaScript (原生 JS 模块化), Chrome Ext, CSS3 Variables

---

## 关联文件清单 (Files to Modify/Move)

- 新增：`sandbox/ui/settings/constants.js`
- 保留：`css/settings_layout.test.js` 作为设置布局 CSS 回归测试
- 修改：
    - `sandbox/ui/settings/view.js`
    - `sandbox/ui/settings/sections/general.js`
    - `sandbox/ui/settings/sections/connection.js`
    - `css/settings.css`
    - `css/settings_controls.css`
    - `settings/index.html`

---

### Task 1: 规范文件目录：确认布局测试归属

**Files:**

- Keep: `css/settings_layout.test.js`

- [ ] **Step 1: 保持 CSS 布局回归测试在样式目录下**

Run: `test -f css/settings_layout.test.js`

- [ ] **Step 2: 运行测试验证布局约束仍被保护**

Run: `npx vitest run css/settings_layout.test.js`
Expected: PASS (测试成功运行且无引入报错)

- [ ] **Step 3: 提交更改**

Run:

```bash
git add css/settings_layout.test.js
git commit -m "test: keep settings layout regression test with CSS"
```

---

### Task 2: 提取设置页 DOM 常量与配置常量

**Files:**

- Create: `sandbox/ui/settings/constants.js`

- [ ] **Step 1: 新建并编写 `constants.js`，集中规范 DOM ID 和魔法值**

编写 `sandbox/ui/settings/constants.js`，内容如下：

```javascript
export const DOM_IDS = {
    MODAL: 'settings-modal',
    BTN_CLOSE: 'close-settings',
    BTN_SAVE: 'save-shortcuts',
    BTN_RESET: 'reset-shortcuts',
    PROVIDER_SELECT: 'provider-select',
    API_KEY_CONTAINER: 'api-key-container',
    OFFICIAL_FIELDS: 'official-fields',
    OFFICIAL_BASE_URL: 'official-base-url',
    API_KEY_INPUT: 'api-key-input',
    OFFICIAL_MODEL: 'official-model',
    THINKING_LEVEL_SELECT: 'thinking-level-select',
    OFFICIAL_WEB_SEARCH_ENABLED: 'official-web-search-enabled',
    OPENAI_FIELDS: 'openai-fields',
    OPENAI_BASE_URL: 'openai-base-url',
    OPENAI_API_KEY: 'openai-api-key',
    OPENAI_MODEL: 'openai-model',
    OPENAI_THINKING_LEVEL_SELECT: 'openai-thinking-level-select',
    OPENAI_USE_RESPONSES_API: 'openai-use-responses-api',
    OPENAI_WEB_SEARCH_ENABLED: 'openai-web-search-enabled',
    MCP_ENABLED: 'mcp-enabled',
    MCP_FIELDS: 'mcp-fields',
    MCP_SERVER_SELECT: 'mcp-server-select',
    MCP_ADD_SERVER: 'mcp-add-server',
    MCP_REMOVE_SERVER: 'mcp-remove-server',
    MCP_SERVER_NAME: 'mcp-server-name',
    MCP_TRANSPORT: 'mcp-transport',
    MCP_SERVER_URL: 'mcp-server-url',
    MCP_HEADERS: 'mcp-headers',
    MCP_SERVER_ENABLED: 'mcp-server-enabled',
    MCP_TEST_CONNECTION: 'mcp-test-connection',
    MCP_TEST_STATUS: 'mcp-test-status',
    MCP_TOOL_MODE: 'mcp-tool-mode',
    MCP_REFRESH_TOOLS: 'mcp-refresh-tools',
    MCP_ENABLE_ALL_TOOLS: 'mcp-enable-all-tools',
    MCP_DISABLE_ALL_TOOLS: 'mcp-disable-all-tools',
    MCP_TOOL_SEARCH: 'mcp-tool-search',
    MCP_TOOLS_SUMMARY: 'mcp-tools-summary',
    MCP_TOOL_LIST: 'mcp-tool-list',
    TEXT_SELECTION_TOGGLE: 'text-selection-toggle',
    TEXT_SELECTION_BLACKLIST: 'text-selection-blacklist',
    IMAGE_TOOLS_TOGGLE: 'image-tools-toggle',
    CUSTOM_SELECTION_TOOLS_LIST: 'custom-selection-tools-list',
    ADD_CUSTOM_SELECTION_TOOL: 'add-custom-selection-tool',
    ACCOUNT_INDICES_INPUT: 'account-indices-input',
    CONTEXT_MODE_SELECT: 'context-mode-select',
    CONTEXT_RECENT_TURNS_INPUT: 'context-recent-turns-input',
};

export const SETTINGS_LIMITS = {
    MIN_TURNS: 1,
    MAX_TURNS: 50,
};
```

- [ ] **Step 2: 提交新增的常量文件**

Run:

```bash
git add sandbox/ui/settings/constants.js
git commit -m "feat: introduce DOM_IDS and SETTINGS_LIMITS constants"
```

---

### Task 3: 消除生命周期隐患与内存泄漏：重构 SettingsView

**Files:**

- Modify: `sandbox/ui/settings/view.js`

- [ ] **Step 1: 引入 `DOM_IDS` 常量，改造 `queryElements()` 并精确管理 Escape 键盘事件**

用 `Read` 工具读取 `sandbox/ui/settings/view.js` 以便修改：
将 `queryElements` 中硬编码的 ID 替换为 `DOM_IDS` 常量；在 `open()` 注册 keydown 监听器，并在 `close()` 中手动销毁以防内存泄漏。

```javascript
import { ConnectionSection } from './sections/connection.js';
import { GeneralSection } from './sections/general.js';
import { AppearanceSection } from './sections/appearance.js';
import { ShortcutsSection } from './sections/shortcuts.js';
import { AboutSection } from './sections/about.js';
import { DOM_IDS } from './constants.js';

export class SettingsView {
    constructor(callbacks) {
        this.callbacks = callbacks || {};
        this.elements = {};

        this.connection = new ConnectionSection();

        this.general = new GeneralSection({
            onTextSelectionChange: (value) => this.fire('onTextSelectionChange', value),
            onImageToolsChange: (value) => this.fire('onImageToolsChange', value),
            onSidebarBehaviorChange: (value) => this.fire('onSidebarBehaviorChange', value),
            onSidePanelScopeChange: (value) => this.fire('onSidePanelScopeChange', value),
        });

        this.appearance = new AppearanceSection({
            onThemeChange: (value) => this.fire('onThemeChange', value),
            onLanguageChange: (value) => this.fire('onLanguageChange', value),
        });

        this.shortcuts = new ShortcutsSection();

        this.about = new AboutSection({
            onDownloadLogs: () => this.fire('onDownloadLogs'),
        });

        // 绑定 keydown 的 this 作用域以便注销
        this.handleEscapeKey = this.handleEscapeKey.bind(this);

        this.queryElements();
        this.bindEvents();
    }

    queryElements() {
        const get = (id) => document.getElementById(id);

        this.elements = {
            modal: get(DOM_IDS.MODAL),
            btnClose: get(DOM_IDS.BTN_CLOSE),
            btnSave: get(DOM_IDS.BTN_SAVE),
            btnReset: get(DOM_IDS.BTN_RESET),
        };
    }

    bindEvents() {
        const { modal, btnClose, btnSave, btnReset } = this.elements;

        if (btnClose) btnClose.addEventListener('click', () => this.close());
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }

        if (btnSave) btnSave.addEventListener('click', () => this.handleSave());
        if (btnReset) btnReset.addEventListener('click', () => this.handleReset());

        // Tab 切换逻辑保持原样...
        const tabs = document.querySelectorAll('.settings-tab');
        const sections = document.querySelectorAll('.settings-section');
        const tabTitle = document.getElementById('settings-tab-title');

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');

                tabs.forEach((t) => t.classList.remove('active'));
                sections.forEach((s) => s.classList.remove('active'));

                tab.classList.add('active');
                const activeSection = document.querySelector(
                    `.settings-section[data-section="${targetTab}"]`
                );
                if (activeSection) activeSection.classList.add('active');

                if (tabTitle) {
                    const labelSpan = tab.querySelector('.tab-label');
                    if (labelSpan) {
                        tabTitle.textContent = labelSpan.textContent;
                        const i18nKey = labelSpan.getAttribute('data-i18n');
                        if (i18nKey) {
                            tabTitle.setAttribute('data-i18n', i18nKey);
                        } else {
                            tabTitle.removeAttribute('data-i18n');
                        }
                    }
                }
            });
        });
    }

    handleEscapeKey(e) {
        if (
            e.key === 'Escape' &&
            this.elements.modal &&
            this.elements.modal.classList.contains('visible')
        ) {
            this.close();
        }
    }

    open() {
        if (this.elements.modal) {
            this.elements.modal.classList.add('visible');

            const firstTab = document.querySelector('.settings-tab[data-tab="connection"]');
            if (firstTab) firstTab.click();

            // 动态挂载 Escape 键盘事件
            document.addEventListener('keydown', this.handleEscapeKey);
            this.fire('onOpen');
        }
    }

    close() {
        if (this.elements.modal) {
            this.elements.modal.classList.remove('visible');
            // 彻底销毁 Escape 键盘事件，杜绝累积事件造成的内存泄漏
            document.removeEventListener('keydown', this.handleEscapeKey);
        }
    }

    // 其余代理方法保持一致
    setShortcuts(shortcuts) {
        this.shortcuts.setData(shortcuts);
    }
    setThemeValue(theme) {
        this.appearance.setTheme(theme);
    }
    setLanguageValue(lang) {
        this.appearance.setLanguage(lang);
    }
    applyVisualTheme(theme) {
        this.appearance.applyVisualTheme(theme);
    }
    setToggles(textSelection, imageTools) {
        this.general.setToggles(textSelection, imageTools);
    }
    setTextSelectionBlacklist(value) {
        this.general.setTextSelectionBlacklist(value);
    }
    setCustomSelectionTools(tools) {
        this.general.setCustomSelectionTools(tools);
    }
    setSidebarBehavior(behavior) {
        this.general.setSidebarBehavior(behavior);
    }
    setAccountIndices(value) {
        this.general.setAccountIndices(value);
    }
    setSidePanelScope(scope) {
        this.general.setSidePanelScope(scope);
    }
    setContextSettings(settings) {
        this.general.setContextSettings(settings);
    }
    setConnectionSettings(data) {
        this.connection.setData(data);
    }
    displayStars(count) {
        this.about.displayStars(count);
    }
    hasFetchedStars() {
        return this.about.hasFetchedStars();
    }
    getCurrentVersion() {
        return this.about.getCurrentVersion();
    }
    displayUpdateStatus(latest, current, isUpdateAvailable) {
        this.about.displayUpdateStatus(latest, current, isUpdateAvailable);
    }
    setAppVersion(version) {
        this.about.setCurrentVersion(version);
    }
    fire(event, data) {
        if (this.callbacks[event]) this.callbacks[event](data);
    }
    handleSave() {
        const data = this.getFormData();
        this.fire('onSave', data);
        this.close();
    }
    getFormData() {
        return {
            shortcuts: this.shortcuts.getData(),
            connection: this.connection.getData(),
            textSelection: this.general.getData().textSelection,
            textSelectionBlacklist: this.general.getData().textSelectionBlacklist,
            customSelectionTools: this.general.getData().customSelectionTools,
            imageTools: this.general.getData().imageTools,
            accountIndices: this.general.getData().accountIndices,
            sidebarBehavior: this.general.getData().sidebarBehavior,
            sidePanelScope: this.general.getData().sidePanelScope,
            contextMode: this.general.getData().contextMode,
            contextRecentTurns: this.general.getData().contextRecentTurns,
        };
    }
    handleReset() {
        this.fire('onReset');
    }
}
```

- [ ] **Step 2: 运行测试，确保重构后的 View 在 Vitest 中可以跑通**

Run: `npx vitest run sandbox/ui/settings/index.test.js`
Expected: PASS

- [ ] **Step 3: 提交更改**

Run:

```bash
git add sandbox/ui/settings/view.js
git commit -m "refactor: eliminate memory leak in keydown handlers and adopt DOM_IDS constants"
```

---

### Task 4: 使用“事件委托”重构 General 选项卡以消除匿名事件监听器隐患

**Files:**

- Modify: `sandbox/ui/settings/sections/general.js`

- [ ] **Step 1: 重构 `GeneralSection`：替换 DOM 硬编码 ID 并改用事件委托进行“自定义工具删除”的绑定**

用 `Read` 再次确认 `sandbox/ui/settings/sections/general.js`。
我们把 `remove.addEventListener(...)` 移除，通过在 `customSelectionToolsList` 上绑定单次事件监听，利用 `.closest('.custom-selection-tool-remove')` 进行事件委托。

```javascript
import {
    DEFAULT_CONTEXT_MODE,
    DEFAULT_CONTEXT_RECENT_TURNS,
    DEFAULT_SIDE_PANEL_SCOPE,
} from '../../../../shared/config/constants.js';
import { normalizeCustomSelectionTools } from '../../../../shared/settings/selection_tools.js';
import { createPrefixedId } from '../../../../shared/utils/index.js';
import { t } from '../../../core/i18n.js';
import { DOM_IDS, SETTINGS_LIMITS } from '../constants.js';

function createCustomSelectionToolId() {
    return createPrefixedId('custom_tool');
}

export class GeneralSection {
    constructor(callbacks) {
        this.callbacks = callbacks || {};
        this.elements = {};
        this.queryElements();
        this.bindEvents();
    }

    queryElements() {
        const get = (id) => document.getElementById(id);
        this.elements = {
            textSelectionToggle: get(DOM_IDS.TEXT_SELECTION_TOGGLE),
            textSelectionBlacklistInput: get(DOM_IDS.TEXT_SELECTION_BLACKLIST),
            imageToolsToggle: get(DOM_IDS.IMAGE_TOOLS_TOGGLE),
            customSelectionToolsList: get(DOM_IDS.CUSTOM_SELECTION_TOOLS_LIST),
            customSelectionToolAdd: get(DOM_IDS.ADD_CUSTOM_SELECTION_TOOL),
            accountIndicesInput: get(DOM_IDS.ACCOUNT_INDICES_INPUT),
            contextModeSelect: get(DOM_IDS.CONTEXT_MODE_SELECT),
            contextRecentTurnsInput: get(DOM_IDS.CONTEXT_RECENT_TURNS_INPUT),
            sidebarRadios: document.querySelectorAll('input[name="sidebar-behavior"]'),
            sidePanelScopeRadios: document.querySelectorAll('input[name="sidepanel-scope"]'),
        };
    }

    bindEvents() {
        const {
            textSelectionToggle,
            imageToolsToggle,
            customSelectionToolAdd,
            customSelectionToolsList,
            sidebarRadios,
            sidePanelScopeRadios,
        } = this.elements;

        if (textSelectionToggle) {
            textSelectionToggle.addEventListener('change', (event) =>
                this.fire('onTextSelectionChange', event.target.checked)
            );
        }
        if (imageToolsToggle) {
            imageToolsToggle.addEventListener('change', (event) =>
                this.fire('onImageToolsChange', event.target.checked)
            );
        }
        if (customSelectionToolAdd) {
            customSelectionToolAdd.addEventListener('click', () => {
                this.addCustomSelectionToolRow({
                    id: createCustomSelectionToolId(),
                    name: '',
                    prompt: '',
                    enabled: true,
                });
            });
        }
        // 实现事件委托，彻底杜绝每一个移除按钮各自挂载监听器造成的性能和内存消耗
        if (customSelectionToolsList) {
            customSelectionToolsList.addEventListener('click', (event) => {
                const removeBtn = event.target.closest('.custom-selection-tool-remove');
                if (removeBtn) {
                    const row = removeBtn.closest('.custom-selection-tool-row');
                    if (row) {
                        row.remove();
                    }
                }
            });
        }
        if (sidebarRadios) {
            sidebarRadios.forEach((radio) => {
                radio.addEventListener('change', (event) => {
                    if (event.target.checked) {
                        this.fire('onSidebarBehaviorChange', event.target.value);
                    }
                });
            });
        }
        if (sidePanelScopeRadios) {
            sidePanelScopeRadios.forEach((radio) => {
                radio.addEventListener('change', (event) => {
                    if (event.target.checked) {
                        this.fire('onSidePanelScopeChange', event.target.value);
                    }
                });
            });
        }
    }

    setToggles(textSelection, imageTools) {
        if (this.elements.textSelectionToggle)
            this.elements.textSelectionToggle.checked = textSelection;
        if (this.elements.imageToolsToggle) this.elements.imageToolsToggle.checked = imageTools;
    }

    setTextSelectionBlacklist(value) {
        if (this.elements.textSelectionBlacklistInput) {
            this.elements.textSelectionBlacklistInput.value = value || '';
        }
    }

    setCustomSelectionTools(tools) {
        if (!this.elements.customSelectionToolsList) return;

        this.elements.customSelectionToolsList.replaceChildren();
        normalizeCustomSelectionTools(tools).forEach((tool) => {
            this.addCustomSelectionToolRow(tool);
        });
    }

    addCustomSelectionToolRow(tool) {
        const list = this.elements.customSelectionToolsList;
        if (!list) return;

        const row = document.createElement('div');
        row.className = 'custom-selection-tool-row';
        row.dataset.toolId = tool.id || createCustomSelectionToolId();

        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'custom-selection-tool-enabled-label';
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.className = 'custom-selection-tool-enabled';
        enabled.checked = tool.enabled !== false;
        enabledLabel.appendChild(enabled);

        const fields = document.createElement('div');
        fields.className = 'custom-selection-tool-fields';

        const name = document.createElement('input');
        name.type = 'text';
        name.className = 'settings-input settings-full-input custom-selection-tool-name';
        name.placeholder = t('customSelectionToolNamePlaceholder');
        name.value = tool.name || '';

        const prompt = document.createElement('textarea');
        prompt.className =
            'settings-input settings-full-input settings-monospace-textarea custom-selection-tool-prompt';
        prompt.placeholder = t('customSelectionToolPromptPlaceholder');
        prompt.value = tool.prompt || '';

        fields.appendChild(name);
        fields.appendChild(prompt);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-secondary settings-secondary-action custom-selection-tool-remove';
        remove.textContent = t('customSelectionToolRemove');

        row.appendChild(enabledLabel);
        row.appendChild(fields);
        row.appendChild(remove);
        list.appendChild(row);
    }

    setAccountIndices(value) {
        if (this.elements.accountIndicesInput)
            this.elements.accountIndicesInput.value = value || '0';
    }

    setSidebarBehavior(behavior) {
        if (this.elements.sidebarRadios) {
            const selectedValue = behavior || 'auto';
            this.elements.sidebarRadios.forEach((radio) => {
                radio.checked = radio.value === selectedValue;
            });
        }
    }

    setSidePanelScope(scope) {
        if (this.elements.sidePanelScopeRadios) {
            const availableValues = new Set(
                Array.from(this.elements.sidePanelScopeRadios).map((radio) => radio.value)
            );
            const selectedValue = availableValues.has(scope) ? scope : DEFAULT_SIDE_PANEL_SCOPE;
            this.elements.sidePanelScopeRadios.forEach((radio) => {
                radio.checked = radio.value === selectedValue;
            });
        }
    }

    setContextSettings(settings) {
        const mode = settings?.mode === 'recent' ? 'recent' : DEFAULT_CONTEXT_MODE;
        const recentTurns = Number.parseInt(settings?.recentTurns, 10);

        if (this.elements.contextModeSelect) {
            this.elements.contextModeSelect.value = mode;
        }
        if (this.elements.contextRecentTurnsInput) {
            this.elements.contextRecentTurnsInput.value = Number.isFinite(recentTurns)
                ? recentTurns
                : DEFAULT_CONTEXT_RECENT_TURNS;
        }
    }

    getData() {
        const {
            textSelectionToggle,
            textSelectionBlacklistInput,
            imageToolsToggle,
            customSelectionToolsList,
            accountIndicesInput,
            contextModeSelect,
            contextRecentTurnsInput,
            sidebarRadios,
            sidePanelScopeRadios,
        } = this.elements;
        const selectedSidebarBehavior =
            Array.from(sidebarRadios || []).find((radio) => radio.checked)?.value || 'auto';
        const selectedScope =
            Array.from(sidePanelScopeRadios || []).find((radio) => radio.checked)?.value ||
            DEFAULT_SIDE_PANEL_SCOPE;

        // 防御性数值校验与溢出拦截
        let turns = Number.parseInt(
            contextRecentTurnsInput ? contextRecentTurnsInput.value : '',
            10
        );
        if (!Number.isFinite(turns) || turns < SETTINGS_LIMITS.MIN_TURNS) {
            turns = SETTINGS_LIMITS.MIN_TURNS;
        } else if (turns > SETTINGS_LIMITS.MAX_TURNS) {
            turns = SETTINGS_LIMITS.MAX_TURNS;
        }

        return {
            textSelection: textSelectionToggle ? textSelectionToggle.checked : true,
            textSelectionBlacklist: textSelectionBlacklistInput
                ? textSelectionBlacklistInput.value
                : '',
            imageTools: imageToolsToggle ? imageToolsToggle.checked : true,
            customSelectionTools: this.getCustomSelectionTools(customSelectionToolsList),
            accountIndices: accountIndicesInput ? accountIndicesInput.value : '0',
            sidebarBehavior: selectedSidebarBehavior,
            sidePanelScope: selectedScope,
            contextMode: contextModeSelect ? contextModeSelect.value : DEFAULT_CONTEXT_MODE,
            contextRecentTurns: turns,
        };
    }

    getCustomSelectionTools(list = this.elements.customSelectionToolsList) {
        if (!list) return [];

        return [...list.querySelectorAll('.custom-selection-tool-row')].map((row) => ({
            id: row.dataset.toolId || '',
            name: row.querySelector('.custom-selection-tool-name')?.value || '',
            prompt: row.querySelector('.custom-selection-tool-prompt')?.value || '',
            enabled: row.querySelector('.custom-selection-tool-enabled')?.checked !== false,
        }));
    }

    fire(event, data) {
        if (this.callbacks[event]) this.callbacks[event](data);
    }
}
```

- [ ] **Step 2: 运行测试确保 GeneralSection 功能一切正常**

Run: `npx vitest run sandbox/ui/settings/sections/general.test.js`
Expected: PASS

- [ ] **Step 3: 提交更改**

Run:

```bash
git add sandbox/ui/settings/sections/general.js
git commit -m "refactor: implement event delegation in custom tool removal and reinforce numeric bounds validation"
```

---

### Task 5: 重构 Connection 选项卡：杜绝 data 缺失时的崩溃风险

**Files:**

- Modify: `sandbox/ui/settings/sections/connection.js`

- [ ] **Step 1: 重构 `ConnectionSection`，在 `setData` 和 `getData` 中执行对 `data` 的非空防御**

用 `Read` 观察 `sandbox/ui/settings/sections/connection.js`。
增加针对 `data` 是否为空的安全边界防御，替换为 `DOM_IDS` 常量。

```javascript
import {
    DEFAULT_MCP_TRANSPORT,
    DEFAULT_OFFICIAL_BASE_URL,
    DEFAULT_OFFICIAL_MODELS,
    DEFAULT_PROVIDER,
    DEFAULT_THINKING_LEVEL,
} from '../../../../shared/config/constants.js';
import {
    createDefaultMcpServer,
    getDefaultMcpUrlForTransport,
} from '../../../../shared/settings/connection.js';
import { inferMcpTransport, normalizeMcpHeaders } from '../../../../shared/mcp/transport.js';
import { normalizeOpenAIWebSearchSettings } from '../../../../shared/settings/openai.js';
import { createPrefixedId } from '../../../../shared/utils/index.js';
import { formatMcpHeaders, parseMcpHeadersText } from './mcp_header_fields.js';
import { bindConnectionSectionEvents } from './connection_events.js';
import { renderMcpToolsUI } from './mcp_tools_view.js';
import { t } from '../../../core/i18n.js';
import { DOM_IDS } from '../constants.js';

export function createMcpServerId() {
    return createPrefixedId('srv');
}

export class ConnectionSection {
    constructor() {
        this.elements = {};
        this.mcpServers = [];
        this.mcpActiveServerId = null;
        this.mcpToolsCache = new Map();
        this.mcpToolsUiState = new Map();
        this.queryElements();
        this.bindEvents();
    }

    _makeServerId() {
        return createMcpServerId();
    }

    _getDefaultServer() {
        return createDefaultMcpServer(this._makeServerId());
    }

    _getDefaultUrlForTransport(transport) {
        return getDefaultMcpUrlForTransport(transport);
    }

    queryElements() {
        const get = (id) => document.getElementById(id);
        this.elements = {
            providerSelect: get(DOM_IDS.PROVIDER_SELECT),
            apiKeyContainer: get(DOM_IDS.API_KEY_CONTAINER),
            officialFields: get(DOM_IDS.OFFICIAL_FIELDS),
            officialBaseUrl: get(DOM_IDS.OFFICIAL_BASE_URL),
            apiKeyInput: get(DOM_IDS.API_KEY_INPUT),
            officialModel: get(DOM_IDS.OFFICIAL_MODEL),
            thinkingLevelSelect: get(DOM_IDS.THINKING_LEVEL_SELECT),
            officialWebSearchEnabled: get(DOM_IDS.OFFICIAL_WEB_SEARCH_ENABLED),
            openaiFields: get(DOM_IDS.OPENAI_FIELDS),
            openaiBaseUrl: get(DOM_IDS.OPENAI_BASE_URL),
            openaiApiKey: get(DOM_IDS.OPENAI_API_KEY),
            openaiModel: get(DOM_IDS.OPENAI_MODEL),
            openaiThinkingLevelSelect: get(DOM_IDS.OPENAI_THINKING_LEVEL_SELECT),
            openaiUseResponsesApi: get(DOM_IDS.OPENAI_USE_RESPONSES_API),
            openaiWebSearch: get(DOM_IDS.OPENAI_WEB_SEARCH_ENABLED),
            mcpEnabled: get(DOM_IDS.MCP_ENABLED),
            mcpFields: get(DOM_IDS.MCP_FIELDS),
            mcpServerSelect: get(DOM_IDS.MCP_SERVER_SELECT),
            mcpAddServer: get(DOM_IDS.MCP_ADD_SERVER),
            mcpRemoveServer: get(DOM_IDS.MCP_REMOVE_SERVER),
            mcpServerName: get(DOM_IDS.MCP_SERVER_NAME),
            mcpTransport: get(DOM_IDS.MCP_TRANSPORT),
            mcpServerUrl: get(DOM_IDS.MCP_SERVER_URL),
            mcpHeaders: get(DOM_IDS.MCP_HEADERS),
            mcpServerEnabled: get(DOM_IDS.MCP_SERVER_ENABLED),
            mcpTestConnection: get(DOM_IDS.MCP_TEST_CONNECTION),
            mcpTestStatus: get(DOM_IDS.MCP_TEST_STATUS),
            mcpToolMode: get(DOM_IDS.MCP_TOOL_MODE),
            mcpRefreshTools: get(DOM_IDS.MCP_REFRESH_TOOLS),
            mcpEnableAllTools: get(DOM_IDS.MCP_ENABLE_ALL_TOOLS),
            mcpDisableAllTools: get(DOM_IDS.MCP_DISABLE_ALL_TOOLS),
            mcpToolSearch: get(DOM_IDS.MCP_TOOL_SEARCH),
            mcpToolsSummary: get(DOM_IDS.MCP_TOOLS_SUMMARY),
            mcpToolList: get(DOM_IDS.MCP_TOOL_LIST),
        };
    }

    bindEvents() {
        bindConnectionSectionEvents(this);
    }

    setData(data) {
        // 非空防御，防止由于外部传入 data 缺失而导致的解构崩溃
        const safeData = data || {};

        const {
            providerSelect,
            officialBaseUrl,
            apiKeyInput,
            officialModel,
            thinkingLevelSelect,
            officialWebSearchEnabled,
            openaiBaseUrl,
            openaiApiKey,
            openaiModel,
            openaiThinkingLevelSelect,
            openaiUseResponsesApi,
            openaiWebSearch,
            mcpEnabled,
        } = this.elements;

        const provider = safeData.provider || DEFAULT_PROVIDER;

        if (providerSelect) {
            providerSelect.value = provider;
            this.updateVisibility(provider);
        }

        if (officialBaseUrl)
            officialBaseUrl.value = safeData.officialBaseUrl || DEFAULT_OFFICIAL_BASE_URL;
        if (apiKeyInput) apiKeyInput.value = safeData.apiKey || '';
        if (officialModel) officialModel.value = safeData.officialModel || DEFAULT_OFFICIAL_MODELS;
        if (thinkingLevelSelect)
            thinkingLevelSelect.value = safeData.thinkingLevel || DEFAULT_THINKING_LEVEL;
        if (officialWebSearchEnabled)
            officialWebSearchEnabled.checked = safeData.officialWebSearch === true;

        if (openaiBaseUrl) openaiBaseUrl.value = safeData.openaiBaseUrl || '';
        if (openaiApiKey) openaiApiKey.value = safeData.openaiApiKey || '';
        if (openaiModel) openaiModel.value = safeData.openaiModel || '';
        if (openaiThinkingLevelSelect)
            openaiThinkingLevelSelect.value =
                safeData.openaiThinkingLevel || DEFAULT_THINKING_LEVEL;
        const openaiSettings = normalizeOpenAIWebSearchSettings(safeData);
        if (openaiUseResponsesApi) openaiUseResponsesApi.checked = openaiSettings.useResponsesApi;
        if (openaiWebSearch) openaiWebSearch.checked = openaiSettings.webSearch;

        if (mcpEnabled) {
            mcpEnabled.checked = safeData.mcpEnabled === true;
            this.updateMcpVisibility(mcpEnabled.checked);
        }

        const servers = Array.isArray(safeData.mcpServers) ? safeData.mcpServers : null;
        const activeId =
            typeof safeData.mcpActiveServerId === 'string' ? safeData.mcpActiveServerId : null;

        if (servers && servers.length > 0) {
            this.mcpServers = servers.map((s) => ({
                id: s.id || this._makeServerId(),
                name: s.name || '',
                transport: s.transport || DEFAULT_MCP_TRANSPORT,
                url: s.url || '',
                headers: normalizeMcpHeaders(s.headers),
                enabled: s.enabled !== false,
                toolMode: s.toolMode === 'selected' ? 'selected' : 'all',
                enabledTools: Array.isArray(s.enabledTools) ? s.enabledTools : [],
            }));
            this.mcpActiveServerId =
                activeId && this.mcpServers.some((s) => s.id === activeId)
                    ? activeId
                    : this.mcpServers[0].id;
        } else {
            const legacyUrl = safeData.mcpServerUrl || '';
            const legacyTransport = safeData.mcpTransport || DEFAULT_MCP_TRANSPORT;
            const server = this._getDefaultServer();
            server.transport = legacyTransport;
            server.url = legacyUrl || server.url;
            server.headers = normalizeMcpHeaders(safeData.mcpHeaders);
            server.enabled = safeData.mcpEnabled === true;
            this.mcpServers = [server];
            this.mcpActiveServerId = server.id;
        }

        this._renderMcpServerOptions();
        this._loadActiveServerIntoForm();
        this.setMcpTestStatus('');
    }

    getData() {
        const {
            providerSelect,
            officialBaseUrl,
            apiKeyInput,
            officialModel,
            thinkingLevelSelect,
            officialWebSearchEnabled,
            openaiBaseUrl,
            openaiApiKey,
            openaiModel,
            openaiThinkingLevelSelect,
            openaiUseResponsesApi,
            openaiWebSearch,
            mcpEnabled,
        } = this.elements;

        this._saveCurrentServerEdits();
        const servers = Array.isArray(this.mcpServers) ? this.mcpServers : [];
        const firstEnabled = servers.find((s) => s.enabled !== false && s.url && s.url.trim());

        return {
            provider: providerSelect ? providerSelect.value : DEFAULT_PROVIDER,
            officialBaseUrl: officialBaseUrl
                ? officialBaseUrl.value.trim()
                : DEFAULT_OFFICIAL_BASE_URL,
            apiKey: apiKeyInput ? apiKeyInput.value.trim() : '',
            officialModel: officialModel ? officialModel.value.trim() : DEFAULT_OFFICIAL_MODELS,
            thinkingLevel: thinkingLevelSelect ? thinkingLevelSelect.value : DEFAULT_THINKING_LEVEL,
            officialWebSearch: officialWebSearchEnabled
                ? officialWebSearchEnabled.checked === true
                : false,
            openaiBaseUrl: openaiBaseUrl ? openaiBaseUrl.value.trim() : '',
            openaiApiKey: openaiApiKey ? openaiApiKey.value.trim() : '',
            openaiModel: openaiModel ? openaiModel.value.trim() : '',
            openaiThinkingLevel: openaiThinkingLevelSelect
                ? openaiThinkingLevelSelect.value
                : DEFAULT_THINKING_LEVEL,
            openaiUseResponsesApi: openaiUseResponsesApi
                ? openaiUseResponsesApi.checked === true
                : false,
            openaiWebSearch: openaiWebSearch ? openaiWebSearch.checked === true : false,

            mcpEnabled: mcpEnabled ? mcpEnabled.checked === true : false,
            mcpServers: servers,
            mcpActiveServerId: this.mcpActiveServerId || (servers[0] ? servers[0].id : null),

            mcpTransport: firstEnabled
                ? firstEnabled.transport || DEFAULT_MCP_TRANSPORT
                : DEFAULT_MCP_TRANSPORT,
            mcpServerUrl: firstEnabled ? firstEnabled.url || '' : '',
        };
    }

    updateVisibility(provider) {
        const { apiKeyContainer, officialFields, openaiFields } = this.elements;
        if (!apiKeyContainer) return;

        if (provider === 'web') {
            apiKeyContainer.hidden = true;
        } else {
            apiKeyContainer.hidden = false;
            if (provider === 'official') {
                if (officialFields) officialFields.hidden = false;
                if (openaiFields) openaiFields.hidden = true;
            } else if (provider === 'openai') {
                if (officialFields) officialFields.hidden = true;
                if (openaiFields) openaiFields.hidden = false;
            }
        }
    }

    updateMcpVisibility(enabled) {
        const { mcpFields } = this.elements;
        if (!mcpFields) return;
        mcpFields.hidden = !enabled;
    }

    _getActiveServer() {
        if (!this.mcpServers || this.mcpServers.length === 0) return null;
        const activeId = this.mcpActiveServerId;
        const match = activeId ? this.mcpServers.find((s) => s.id === activeId) : null;
        return match || this.mcpServers[0];
    }

    _saveCurrentServerEdits() {
        const {
            mcpServerName,
            mcpTransport,
            mcpServerUrl,
            mcpHeaders,
            mcpServerEnabled,
            mcpToolMode,
        } = this.elements;

        const server = this._getActiveServer();
        if (!server) return false;

        const prevKey = this._serverKey(server);

        if (mcpServerName) server.name = mcpServerName.value || '';
        if (mcpServerUrl) server.url = (mcpServerUrl.value || '').trim();
        if (mcpTransport)
            server.transport = inferMcpTransport(mcpTransport.value || 'sse', server.url);
        if (mcpHeaders) {
            try {
                server.headers = parseMcpHeadersText(mcpHeaders.value);
                this.setMcpTestStatus('');
            } catch (error) {
                this.setMcpTestStatus(error.message || t('mcpConnectionFailed'), true);
                return false;
            }
        }
        if (mcpServerEnabled) server.enabled = mcpServerEnabled.checked === true;
        if (mcpToolMode) server.toolMode = mcpToolMode.value === 'selected' ? 'selected' : 'all';

        const nextKey = this._serverKey(server);
        if (prevKey !== nextKey) {
            this.mcpToolsCache.delete(server.id);
        }
        return true;
    }

    _loadActiveServerIntoForm() {
        const {
            mcpServerSelect,
            mcpServerName,
            mcpTransport,
            mcpServerUrl,
            mcpHeaders,
            mcpServerEnabled,
            mcpToolMode,
        } = this.elements;

        const server = this._getActiveServer();
        if (!server) return;

        if (mcpServerSelect) mcpServerSelect.value = server.id;
        if (mcpServerName) mcpServerName.value = server.name || '';
        const transport = inferMcpTransport(server.transport || 'sse', server.url || '');
        server.transport = transport;
        if (mcpTransport) mcpTransport.value = transport;
        if (mcpServerUrl) mcpServerUrl.value = server.url || '';
        if (mcpServerUrl)
            mcpServerUrl.placeholder = this._getDefaultUrlForTransport(server.transport || 'sse');
        if (mcpHeaders) mcpHeaders.value = formatMcpHeaders(server.headers);
        if (mcpServerEnabled) mcpServerEnabled.checked = server.enabled !== false;
        if (mcpToolMode) mcpToolMode.value = server.toolMode === 'selected' ? 'selected' : 'all';

        this._renderToolsUI();
    }

    _renderMcpServerOptions() {
        const { mcpServerSelect } = this.elements;
        if (!mcpServerSelect) return;

        const active = this._getActiveServer();
        if (active) this.mcpActiveServerId = active.id;

        mcpServerSelect.innerHTML = '';
        for (const server of this.mcpServers) {
            const opt = document.createElement('option');
            opt.value = server.id;

            const name = (server.name || '').trim();
            const label = name || server.url || t('defaultMcpServer');
            const status = server.enabled === false ? '✗' : '✓';
            opt.textContent = `${status} ${label}`;
            mcpServerSelect.appendChild(opt);
        }

        if (active) mcpServerSelect.value = active.id;
    }

    setMcpTestStatus(text, isError = false) {
        const { mcpTestStatus } = this.elements;
        if (!mcpTestStatus) return;
        mcpTestStatus.textContent = text || '';
        mcpTestStatus.classList.toggle('is-error', isError);
    }

    _serverKey(server) {
        const transport = (server.transport || 'sse').toLowerCase();
        const url = (server.url || '').trim();
        const headers = normalizeMcpHeaders(server.headers);
        const headersKey = Object.keys(headers)
            .sort((a, b) => a.localeCompare(b))
            .map((key) => `${key}:${headers[key]}`)
            .join('\n');
        return `${transport}:${url}:${headersKey}`;
    }

    _getCachedTools(server) {
        const entry = this.mcpToolsCache.get(server.id);
        if (!entry) return null;
        if (entry.key !== this._serverKey(server)) return null;
        return Array.isArray(entry.tools) ? entry.tools : null;
    }

    setMcpToolsList(serverId, transport, url, tools, requestKey = null) {
        const id = serverId || (this._getActiveServer() ? this._getActiveServer().id : null);
        if (!id) return;

        this.mcpToolsCache.set(id, {
            key: requestKey || `${(transport || 'sse').toLowerCase()}:${(url || '').trim()}:`,
            tools: Array.isArray(tools) ? tools : [],
        });

        this.setMcpTestStatus('');
        this._renderToolsUI();
    }

    _renderToolsUI() {
        const { mcpToolsSummary, mcpToolList, mcpToolSearch } = this.elements;
        const server = this._getActiveServer();
        if (!server || !mcpToolList || !mcpToolsSummary) return;

        const cached = this._getCachedTools(server) || [];
        renderMcpToolsUI({
            server,
            tools: cached,
            search: mcpToolSearch ? mcpToolSearch.value || '' : '',
            summaryElement: mcpToolsSummary,
            listElement: mcpToolList,
            uiState: this._getToolsUiState(server.id),
            onToolsChange: () => this._renderToolsUI(),
        });
    }

    _getToolsUiState(serverId) {
        const key = serverId || 'default';
        const existing = this.mcpToolsUiState.get(key);
        if (existing) return existing;

        const state = { openGroups: new Set() };
        state.openGroups.add('(other)');
        this.mcpToolsUiState.set(key, state);
        return state;
    }
}
```

- [ ] **Step 2: 运行测试确保 ConnectionSection 修改后测试可以完全通过**

Run: `npx vitest run sandbox/ui/settings/sections/connection.test.js`
Expected: PASS

- [ ] **Step 3: 提交更改**

Run:

```bash
git add sandbox/ui/settings/sections/connection.js
git commit -m "refactor: enforce robust null defenses on ConnectionSection setData properties and migrate to DOM_IDS"
```

---

### Task 6: 变量化设置界面硬编码样式

**Files:**

- Modify: `css/settings.css`
- Modify: `css/settings_controls.css`

- [ ] **Step 1: 将硬编码的过渡时间、缓动曲线和盒子阴影提取为 CSS 变量**

用 `Read` 观察 `css/settings.css` 及 `css/settings_controls.css`。
在 `css/settings.css` 头部的 `:root` (或者 `[data-theme]` 环境下，如果有的话) 引入标准的过渡变量，并将样式类里的硬编码值统一替换。

```css
/* css/settings.css 顶部新增变量定义 */
:root {
    --settings-transition-cubic: 0.3s cubic-bezier(0.2, 0, 0, 1);
    --settings-shadow-depth: 0 12px 40px rgba(0, 0, 0, 0.3);
    --settings-shadow-split: 0 20px 50px rgba(0, 0, 0, 0.35);
    --settings-transition-fade: opacity 0.2s ease, visibility 0.2s ease;
}

/* 替换对应类名中的数值 */
.settings-modal {
    ...
    transition: var(--settings-transition-fade);
}

.settings-content {
    ...
    box-shadow: var(--settings-shadow-depth);
    transition: transform var(--settings-transition-cubic), background 0.2s;
}

.settings-content.split-layout {
    ...
    box-shadow: var(--settings-shadow-split);
}
```

- [ ] **Step 2: 提交 CSS 变量化重构的更改**

Run:

```bash
git add css/settings.css css/settings_controls.css
git commit -m "style: extract transition curves and box-shadow hardcodes to CSS variables"
```

---

### Task 7: 优化本地化占位符，消除界面文本抖动噪声

**Files:**

- Modify: `sandbox/ui/templates/settings/connection.js`
- Modify: `sandbox/ui/templates/settings/general.js`
- Modify: `sandbox/ui/templates/footer.js`
- Modify: `sandbox/ui/templates/sidebar.js`

- [ ] **Step 1: 修改模板，移去可能因延迟加载 i18n 导致闪烁的静态 placeholder 文本**

核查设置、footer、sidebar 模板，确认所有使用 `data-i18n-placeholder` 的控件都不再同时写硬编码静态 placeholder。

- [ ] **Step 2: 提交对模板占位符的规范化处理**

Run:

```bash
git add sandbox/ui/templates/settings/connection.js sandbox/ui/templates/settings/general.js sandbox/ui/templates/footer.js sandbox/ui/templates/sidebar.js
git commit -m "docs: standardize i18n translation dynamic placeholder annotations in settings template"
```
