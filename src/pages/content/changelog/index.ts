import { StorageKeys } from '@/core/types/common';
import { getWebStoreRatingChannel } from '@/core/utils/browser';
import { EXTENSION_VERSION } from '@/core/utils/version';
import { getCurrentLanguage } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';
import { TRANSLATIONS, type TranslationKey } from '@/utils/translations';

import { renderPlatformLogoMarks } from './platformLogoMarks';

/**
 * Dynamically import all markdown changelog files.
 * Keyed by relative path, e.g. './notes/1.2.8.md'
 */
const changelogModules = import.meta.glob('./notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: false,
}) as Record<string, () => Promise<string>>;

/**
 * Versions whose changelog must show as a popup even for users who opted into
 * badge-only mode. Reserved for releases the maintainer wants every user to
 * actually read — e.g. when Gemini ships a major UI overhaul that breaks
 * assumptions and a quiet badge would let users miss critical context.
 *
 * Effect: bypasses the badge-mode early-return in startChangelog. The user's
 * CHANGELOG_NOTIFY_MODE preference is preserved untouched for future releases.
 */
const FORCE_POPUP_VERSIONS: ReadonlySet<string> = new Set(['1.4.5']);

/**
 * Seconds the close controls remain disabled after the modal opens for a
 * force-popup version, so users actually skim the notes before dismissing.
 * Only applies to FORCE_POPUP_VERSIONS — regular releases close immediately.
 */
const FORCE_POPUP_READ_GATE_SECONDS = 15;

const MARKDOWN_IMAGE_URL_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const MARKDOWN_DOC_LINK_REGEX = /\[([^\]]*)\]\((\/guide\/[^\s)]+)\)/g;

const GITHUB_PROMOTION_PATH_PREFIX =
  '/boboidvtw/nomad-ai-workspace/raw/main/docs/public/assets/promotion/';
const RAW_GITHUBUSERCONTENT_PROMOTION_PATH_PREFIX =
  '/boboidvtw/nomad-ai-workspace/main/docs/public/assets/promotion/';
const LEGACY_GITHUB_PROMOTION_PATH_PREFIX =
  '/voyager-crew/voyager/raw/main/docs/public/assets/promotion/';
const LEGACY_RAW_GITHUBUSERCONTENT_PROMOTION_PATH_PREFIX =
  '/voyager-crew/voyager/main/docs/public/assets/promotion/';
const SPONSOR_HEART_PATH_24 =
  'M14 20.408c-.492.308-.903.546-1.192.709q-.23.129-.463.252h-.002a.75.75 0 0 1-.686 0a17 17 0 0 1-.465-.252a31 31 0 0 1-4.803-3.34C3.8 15.572 1 12.331 1 8.513C1 5.052 3.829 2.5 6.736 2.5C9.03 2.5 10.881 3.726 12 5.605C13.12 3.726 14.97 2.5 17.264 2.5C20.17 2.5 23 5.052 23 8.514c0 3.818-2.801 7.06-5.389 9.262A31 31 0 0 1 14 20.408';

function getPromotionRuntimePath(filename: string): string | null {
  switch (filename) {
    case 'Activity-View.png':
      return 'changelog-activity-view.png';
    default:
      return null;
  }
}

function getRuntimeUrl(path: string): string | null {
  try {
    const runtime = (
      globalThis as typeof globalThis & {
        browser?: { runtime?: { getURL?: (assetPath: string) => string } };
        chrome?: { runtime?: { getURL?: (assetPath: string) => string } };
      }
    ).browser?.runtime;
    const fallbackRuntime = (
      globalThis as typeof globalThis & {
        chrome?: { runtime?: { getURL?: (assetPath: string) => string } };
      }
    ).chrome?.runtime;
    const getUrl = runtime?.getURL ?? fallbackRuntime?.getURL;
    return typeof getUrl === 'function' ? getUrl(path) : null;
  } catch {
    return null;
  }
}

function extractPromotionRuntimePath(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname;
  const isGithubPromotionImage =
    (host === 'github.com' &&
      (pathname.startsWith(GITHUB_PROMOTION_PATH_PREFIX) ||
        pathname.startsWith(LEGACY_GITHUB_PROMOTION_PATH_PREFIX))) ||
    (host === 'raw.githubusercontent.com' &&
      (pathname.startsWith(RAW_GITHUBUSERCONTENT_PROMOTION_PATH_PREFIX) ||
        pathname.startsWith(LEGACY_RAW_GITHUBUSERCONTENT_PROMOTION_PATH_PREFIX)));
  if (!isGithubPromotionImage) return null;

  const filename = pathname.split('/').pop();
  return filename ? getPromotionRuntimePath(filename) : null;
}

export function resolveChangelogImageUrl(
  url: string,
  runtimeUrlResolver: (path: string) => string | null = getRuntimeUrl,
): string {
  try {
    const parsed = new URL(url);
    const runtimePath = extractPromotionRuntimePath(parsed);
    if (!runtimePath) return url;

    const runtimeUrl = runtimeUrlResolver(runtimePath);
    return runtimeUrl ?? url;
  } catch {
    return url;
  }
}

export function rewriteChangelogImageUrls(
  markdown: string,
  runtimeUrlResolver: (path: string) => string | null = getRuntimeUrl,
  shouldRewrite: boolean = true,
): string {
  if (!shouldRewrite) return markdown;

  return markdown.replace(MARKDOWN_IMAGE_URL_REGEX, (full, alt, url) => {
    const resolvedUrl = resolveChangelogImageUrl(url, runtimeUrlResolver);
    if (resolvedUrl === url) return full;
    return `![${alt}](${resolvedUrl})`;
  });
}

/**
 * Rewrite relative doc links (e.g. `/guide/timeline`) in changelog markdown
 * to full documentation URLs pointing to the user guide.
 */
export function rewriteChangelogDocUrls(markdown: string, lang: AppLanguage): string {
  const base = 'https://github.com/boboidvtw/nomad-ai-workspace/blob/main/docs';
  const docFile = lang === 'zh' || lang === 'zh_TW' ? 'USER_GUIDE.md' : 'USER_GUIDE_EN.md';
  return markdown.replace(MARKDOWN_DOC_LINK_REGEX, (_full, text, _path) => {
    return `[${text}](${base}/${docFile})`;
  });
}

/**
 * Strip optional front matter (--- ... ---) from markdown.
 */
function stripFrontMatter(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return match ? match[1] : raw;
}

/**
 * Extract the section matching the user's language from a multi-language
 * markdown file. Falls back to 'en' if the requested language is missing.
 */
export function extractLocalizedContent(raw: string, lang: AppLanguage): string {
  const body = stripFrontMatter(raw);

  // Split by <!-- lang:xx --> markers
  const sections = new Map<string, string>();
  const parts = body.split(/<!--\s*lang:(\w+)\s*-->/);

  // parts[0] is text before the first marker (usually empty)
  // parts[1] = lang code, parts[2] = content, parts[3] = lang code, etc.
  for (let i = 1; i < parts.length; i += 2) {
    const langCode = parts[i];
    const content = parts[i + 1]?.trim() ?? '';
    if (langCode && content) {
      sections.set(langCode, content);
    }
  }

  return sections.get(lang) ?? sections.get('en') ?? '';
}

/**
 * Translate a key using an explicit language, bypassing cachedLanguage.
 * This avoids race conditions when initI18n() hasn't finished yet.
 */
function t(key: TranslationKey, lang: AppLanguage): string {
  return TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key] ?? key;
}

/**
 * Get the docs URL for the current language.
 * zh and zh_TW link to USER_GUIDE.md, other languages link to USER_GUIDE_EN.md.
 */
export function getDocsUrl(lang: AppLanguage): string {
  const base = 'https://github.com/boboidvtw/nomad-ai-workspace/blob/main/docs';
  if (lang === 'zh' || lang === 'zh_TW') {
    return `${base}/USER_GUIDE.md`;
  }
  return `${base}/USER_GUIDE_EN.md`;
}

/**
 * Get the sponsor page URL for the current language.
 * zh is the root locale (no prefix), others use /{locale}/ prefix.
 */
function getSponsorUrl(_lang: AppLanguage): string {
  return 'https://www.paypal.me/boboidvtw';
}

/**
 * Show a full-screen lightbox preview for the given image.
 */
function showImageLightbox(src: string, alt: string): void {
  const lightbox = document.createElement('div');
  lightbox.className = 'gv-changelog-lightbox';

  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.className = 'gv-changelog-lightbox-img';

  lightbox.appendChild(img);
  document.body.appendChild(lightbox);

  const close = (): void => {
    lightbox.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  lightbox.addEventListener('click', close);
  document.addEventListener('keydown', onKeyDown);
}

const CHROME_STORE_URL = 'https://github.com/boboidvtw/nomad-ai-workspace';
const EDGE_STORE_URL = 'https://github.com/boboidvtw/nomad-ai-workspace';

/**
 * Read the current changelog notification mode.
 */
async function readNotifyMode(): Promise<'popup' | 'badge'> {
  try {
    const result = await chrome.storage.local.get(StorageKeys.CHANGELOG_NOTIFY_MODE);
    const mode = result[StorageKeys.CHANGELOG_NOTIFY_MODE];
    return mode === 'badge' ? 'badge' : 'popup';
  } catch {
    return 'popup';
  }
}

/**
 * Render the changelog modal DOM.
 */
function createChangelogModal(
  htmlContent: string,
  lang: AppLanguage,
  readGateSeconds: number = 0,
): {
  overlay: HTMLDivElement;
  onClose: () => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'gv-changelog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'gv-changelog-dialog';

  // Header
  const header = document.createElement('div');
  header.className = 'gv-changelog-header';

  const title = document.createElement('span');
  title.className = 'gv-changelog-title';
  title.textContent = t('changelog_title', lang);

  const version = document.createElement('span');
  version.className = 'gv-changelog-version';
  version.textContent = `v${EXTENSION_VERSION}`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'gv-changelog-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close');

  header.appendChild(title);
  header.appendChild(version);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'gv-changelog-body';
  body.innerHTML = htmlContent;
  renderPlatformLogoMarks(body);
  const leadingElement = body.firstElementChild;
  if (leadingElement?.tagName === 'BLOCKQUOTE') {
    leadingElement.classList.add('gv-changelog-quote');
  }

  // Bind image zoom on all images in the body
  body.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    img.addEventListener('click', () => showImageLightbox(img.src, img.alt));
  });

  // Footer
  const footer = document.createElement('div');
  footer.className = 'gv-changelog-footer';

  // Action row: icons on the left, "Got it" button on the right
  const actionRow = document.createElement('div');
  actionRow.className = 'gv-changelog-action-row';

  const iconGroup = document.createElement('div');
  iconGroup.className = 'gv-changelog-icon-group';

  // Sponsor (heart) link
  const sponsorLink = document.createElement('a');
  sponsorLink.className = 'gv-changelog-icon-link gv-changelog-icon-sponsor';
  sponsorLink.href = getSponsorUrl(lang);
  sponsorLink.target = '_blank';
  sponsorLink.rel = 'noopener noreferrer';
  sponsorLink.setAttribute('aria-label', 'Sponsor');
  sponsorLink.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="${SPONSOR_HEART_PATH_24}"/></svg>`;

  // GitHub link
  const githubLink = document.createElement('a');
  githubLink.className = 'gv-changelog-icon-link gv-changelog-icon-github';
  githubLink.href = 'https://github.com/boboidvtw/nomad-ai-workspace';
  githubLink.target = '_blank';
  githubLink.rel = 'noopener noreferrer';
  githubLink.setAttribute('aria-label', 'GitHub');
  githubLink.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>';

  // Docs link with annotation
  // (X/Twitter icon is intentionally omitted from this bottom row — it
  // already appears as a chip in the follow-me CTA card above, so a
  // duplicate would just visually crowd the action row.)
  const docsWrapper = document.createElement('div');
  docsWrapper.className = 'gv-changelog-docs-wrapper';

  const docsAnnotation = document.createElement('span');
  docsAnnotation.className = 'gv-changelog-docs-annotation';
  docsAnnotation.textContent = t('changelog_docs_hint', lang);

  const docsLink = document.createElement('a');
  docsLink.className = 'gv-changelog-icon-link gv-changelog-icon-docs';
  docsLink.href = getDocsUrl(lang);
  docsLink.target = '_blank';
  docsLink.rel = 'noopener noreferrer';
  docsLink.setAttribute('aria-label', t('changelog_docs_link', lang));
  // Open-book icon
  docsLink.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>';

  docsWrapper.appendChild(docsAnnotation);
  docsWrapper.appendChild(docsLink);

  iconGroup.appendChild(sponsorLink);
  iconGroup.appendChild(githubLink);
  iconGroup.appendChild(docsWrapper);

  const gotItBtn = document.createElement('button');
  gotItBtn.className = 'gv-changelog-got-it';
  gotItBtn.textContent = t('changelog_close', lang);

  actionRow.appendChild(iconGroup);
  actionRow.appendChild(gotItBtn);

  // The changelog notification-mode toggle lives in General Options in the
  // extension settings (StorageKeys.CHANGELOG_NOTIFY_MODE), so it no longer
  // renders inside this modal.

  // Web store rating prompt (Chrome Web Store / Edge Add-ons).
  // Temporarily hidden — keep the code so we can re-enable it later by flipping
  // this flag back to true.
  const SHOW_STORE_RATING = false;
  const webStoreRatingChannel = getWebStoreRatingChannel();
  const storeRating: {
    url: string;
    textKey: TranslationKey;
    ctaKey: TranslationKey;
  } | null =
    webStoreRatingChannel === 'edge'
      ? { url: EDGE_STORE_URL, textKey: 'changelog_rate_edge', ctaKey: 'changelog_rate_edge_cta' }
      : webStoreRatingChannel === 'chrome'
        ? {
            url: CHROME_STORE_URL,
            textKey: 'changelog_rate_chrome',
            ctaKey: 'changelog_rate_chrome_cta',
          }
        : null;
  if (storeRating && SHOW_STORE_RATING) {
    const ratingBanner = document.createElement('div');
    ratingBanner.className = 'gv-changelog-chrome-rating';

    const ratingText = document.createElement('span');
    ratingText.className = 'gv-changelog-chrome-rating-text';
    ratingText.textContent = t(storeRating.textKey, lang);

    const ratingLink = document.createElement('a');
    ratingLink.className = 'gv-changelog-chrome-rating-link';
    ratingLink.href = storeRating.url;
    ratingLink.target = '_blank';
    ratingLink.rel = 'noopener noreferrer';
    const ratingStar = document.createElement('span');
    ratingStar.className = 'gv-changelog-chrome-rating-star';
    ratingStar.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    const ratingCtaText = document.createElement('span');
    ratingCtaText.textContent = t(storeRating.ctaKey, lang);
    ratingLink.appendChild(ratingStar);
    ratingLink.appendChild(ratingCtaText);

    ratingBanner.appendChild(ratingText);
    ratingBanner.appendChild(ratingLink);
    footer.appendChild(ratingBanner);
  }

  footer.appendChild(actionRow);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);

  // Read-gate countdown: for force-popup releases we briefly disable the
  // close controls (× / Got-it button / outside-click) and show the remaining
  // seconds on the Got-it button. This makes sure users actually see the
  // notes for major releases instead of dismissing reflexively.
  let readyToClose = readGateSeconds <= 0;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  const gotItLabel = t('changelog_close', lang);

  const setGated = (remaining: number) => {
    closeBtn.disabled = true;
    closeBtn.classList.add('gv-changelog-close--gated');
    gotItBtn.disabled = true;
    gotItBtn.classList.add('gv-changelog-got-it--gated');
    gotItBtn.textContent = `${gotItLabel} (${remaining})`;
  };

  const releaseGate = () => {
    readyToClose = true;
    closeBtn.disabled = false;
    closeBtn.classList.remove('gv-changelog-close--gated');
    gotItBtn.disabled = false;
    gotItBtn.classList.remove('gv-changelog-got-it--gated');
    gotItBtn.textContent = gotItLabel;
    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  if (!readyToClose) {
    let remaining = readGateSeconds;
    setGated(remaining);
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        releaseGate();
      } else {
        setGated(remaining);
      }
    }, 1000);
  }

  const onClose = (): void => {
    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    overlay.remove();
  };

  closeBtn.addEventListener('click', () => {
    if (!readyToClose) return;
    onClose();
  });
  gotItBtn.addEventListener('click', () => {
    if (!readyToClose) return;
    onClose();
  });
  // Force-popup releases require an explicit click on × or the Got-it
  // button to dismiss — outside-click never closes the modal, even after
  // the countdown finishes. Regular releases keep the click-outside-to-
  // dismiss convenience.
  const lockOutsideClick = readGateSeconds > 0;
  overlay.addEventListener('click', (e) => {
    if (lockOutsideClick) return;
    if (e.target === overlay && readyToClose) {
      onClose();
    }
  });

  return { overlay, onClose };
}

/**
 * Load and render the changelog modal.
 * @param version - Which version's changelog to show (defaults to EXTENSION_VERSION)
 * @param skipDismissCheck - Skip the dismissed-version check
 * @param applyReadGate - Whether the force-popup read-gate countdown should
 *   engage. True for the auto-popup on page load; false for re-opens from
 *   the prompt manager (the user has already seen this once, no need to
 *   gate them again).
 */
async function showChangelogModal(
  version = EXTENSION_VERSION,
  skipDismissCheck = false,
  applyReadGate = true,
): Promise<HTMLDivElement | null> {
  // 1. Check dismissed version
  if (!skipDismissCheck) {
    const result = await chrome.storage.local.get(StorageKeys.CHANGELOG_DISMISSED_VERSION);
    const dismissedVersion = result[StorageKeys.CHANGELOG_DISMISSED_VERSION] as string | undefined;
    if (dismissedVersion === EXTENSION_VERSION) return null;
    // First install — user has never seen any changelog, so the current
    // version's notes aren't meaningful.  Silently dismiss and let them
    // explore the extension first.
    if (!dismissedVersion) {
      try {
        await chrome.storage.local.set({
          [StorageKeys.CHANGELOG_DISMISSED_VERSION]: EXTENSION_VERSION,
        });
      } catch {
        // Ignore
      }
      return null;
    }
  }

  // 2. Try to load the changelog for the target version
  const modulePath = `./notes/${version}.md`;
  const loader = changelogModules[modulePath];
  if (!loader) return null;

  const rawMarkdown = await loader();

  // 3. Get current language and extract localized content
  const lang = await getCurrentLanguage();
  const extracted = extractLocalizedContent(rawMarkdown, lang);
  if (!extracted) return null;
  const localizedContent = rewriteChangelogDocUrls(
    rewriteChangelogImageUrls(extracted, getRuntimeUrl),
    lang,
  );

  // 4. Convert markdown to HTML
  const [{ marked }, { default: DOMPurify }] = await Promise.all([
    import('marked'),
    import('dompurify'),
  ]);
  const rawHtml = await marked.parse(localizedContent);
  const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'ul',
      'ol',
      'li',
      'strong',
      'em',
      'code',
      'pre',
      'a',
      'img',
      'blockquote',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class'],
    // Changelog images are bundled and resolved to chrome-extension:// or
    // moz-extension:// URLs. DOMPurify's default URI policy allows neither, so
    // without this it silently drops the src and renders a broken image.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|chrome-extension:|moz-extension:)/i,
  });

  // 5. Mark as dismissed BEFORE showing — ensures the modal never re-appears
  //    even if the user navigates away without clicking "Got it".
  //    If this write fails (e.g. extension context invalidated), skip showing
  //    the modal entirely; it will be shown on the next load with a valid context.
  try {
    await chrome.storage.local.set({
      [StorageKeys.CHANGELOG_DISMISSED_VERSION]: EXTENSION_VERSION,
    });
  } catch {
    return null;
  }

  // 6. Inject modal
  const readGateSeconds =
    applyReadGate && FORCE_POPUP_VERSIONS.has(version) ? FORCE_POPUP_READ_GATE_SECONDS : 0;
  const { overlay } = createChangelogModal(sanitizedHtml, lang, readGateSeconds);
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Open the changelog modal for the current version (always shows, no dismiss
 * check). Manual opens from the prompt manager skip the read-gate countdown
 * since the user has already seen the auto-popup once.
 *
 * @returns whether the modal was actually shown — callers reacting to an
 * explicit user click should provide a fallback when this is false.
 */
export async function openChangelog(): Promise<boolean> {
  const overlay = await showChangelogModal(EXTENSION_VERSION, true, false);
  return overlay !== null;
}

/**
 * Check if the current version has an unread changelog.
 */
export async function hasUnreadChangelog(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(StorageKeys.CHANGELOG_DISMISSED_VERSION);
    const dismissed = result[StorageKeys.CHANGELOG_DISMISSED_VERSION] as string | undefined;
    if (!dismissed) return false;
    return dismissed !== EXTENSION_VERSION;
  } catch {
    return false;
  }
}

/**
 * Show the changelog modal directly (used by badge mode in prompt manager).
 * Returns a Promise that resolves when the modal is closed.
 */
export async function showChangelogModalDirect(): Promise<boolean> {
  // Badge-mode prompt-manager open: skip the read-gate. The user is
  // explicitly clicking the changelog button — they don't need a countdown.
  const overlay = await showChangelogModal(EXTENSION_VERSION, true, false);
  if (!overlay) {
    // No notes found for this version — dismiss anyway so badge doesn't persist
    try {
      await chrome.storage.local.set({
        [StorageKeys.CHANGELOG_DISMISSED_VERSION]: EXTENSION_VERSION,
      });
    } catch {
      // Ignore
    }
    return false;
  }

  // Resolve once the overlay is removed (modal closed)
  return new Promise<boolean>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!overlay.isConnected) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(document.body, { childList: true });
  });
}

/**
 * Start the changelog feature.
 * Shows a version-based changelog popup when the user upgrades to a new version.
 * Returns a cleanup function.
 */
export async function startChangelog(opts: { onClosed?: () => void } = {}): Promise<() => void> {
  let overlayRef: HTMLDivElement | null = null;

  // Debug helper: switch DevTools console context to this extension's content script
  // (dropdown next to "top" in the console), then call:
  //   __gvChangelog()          — show current version
  //   __gvChangelog('1.2.8')   — show specific version
  (window as unknown as Record<string, unknown>).__gvChangelog = (version?: string) => {
    showChangelogModal(version ?? EXTENSION_VERSION, true);
  };

  try {
    // In badge mode, skip auto-showing the modal (prompt manager handles it).
    // Exception: force-popup versions ignore this and surface the modal anyway.
    const notifyMode = await readNotifyMode();
    const isForcePopup = FORCE_POPUP_VERSIONS.has(EXTENSION_VERSION);
    if (notifyMode === 'badge' && !isForcePopup) {
      return () => {};
    }

    overlayRef = await showChangelogModal();
    // Fire onClosed once the user dismisses the modal (overlay leaves the DOM).
    // Only when a modal actually showed — so downstream onboarding stays tied to
    // the "what's new" moment.
    if (overlayRef && opts.onClosed) {
      const node = overlayRef;
      const obs = new MutationObserver(() => {
        if (!node.isConnected) {
          obs.disconnect();
          try {
            opts.onClosed?.();
          } catch {
            /* non-critical */
          }
        }
      });
      obs.observe(document.body, { childList: true });
    }
  } catch {
    // Silently fail — changelog is non-critical
  }

  return () => {
    if (overlayRef) {
      overlayRef.remove();
      overlayRef = null;
    }
  };
}
