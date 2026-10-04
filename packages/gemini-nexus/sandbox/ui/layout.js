import {
    SidebarTemplate,
    HeaderTemplate,
    ChatTemplate,
    FooterTemplate,
    ViewerTemplate,
    TabSelectorTemplate,
    SettingsModalTemplate,
} from './templates/index.js';

export function renderLayout() {
    const LayoutTemplate =
        SidebarTemplate +
        HeaderTemplate +
        ChatTemplate +
        FooterTemplate +
        ViewerTemplate +
        TabSelectorTemplate +
        SettingsModalTemplate;
    const app = document.getElementById('app');
    if (app) app.innerHTML = LayoutTemplate;
}
