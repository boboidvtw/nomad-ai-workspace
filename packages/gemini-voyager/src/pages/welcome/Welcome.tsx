import React, { useEffect, useState } from 'react';

import { ArrowUp, ArrowUpRight, Check } from 'lucide-react';
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { isRTLLanguage } from '@/core/utils/rtl';
import { focusOrOpenGemini } from '@/features/onboarding/openGemini';
import type { ToolbarPinBrowser } from '@/features/onboarding/toolbarPin';
import { useToolbarPinState } from '@/features/onboarding/useToolbarPinState';
import { createPopupBrandThemeStyle } from '@/pages/popup/utils/brandTheme';
import type { TranslationKey } from '@/utils/translations';

import { DarkModeToggle } from '../../components/DarkModeToggle';
import { LanguageSelect } from '../../components/LanguageSelect';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDarkMode } from '../../hooks/useDarkMode';
import {
  IconAIStudio,
  IconChatGPT,
  IconClaude,
  IconDeepSeek,
  IconGemini,
} from '../popup/components/WebsiteLogos';
import { ToolbarMock } from './ToolbarMock';

const PIN_STEPS_KEY: Record<Exclude<ToolbarPinBrowser, 'unsupported'>, TranslationKey> = {
  chrome: 'welcomePinStepsChrome',
  edge: 'welcomePinStepsEdge',
  firefox: 'welcomePinStepsFirefox',
};

const GEMINI_SITE_ID = 'gemini';

/**
 * Where the extensions button sits, measured from the window's trailing edge.
 * No browser exposes toolbar geometry, so this is the layout of a default
 * window: Chrome and Edge keep the button left of the profile avatar and the
 * menu; Firefox keeps it just left of the hamburger menu.
 */
const ARROW_INSET_CLASS: Record<Exclude<ToolbarPinBrowser, 'unsupported'>, string> = {
  chrome: 'end-[6.25rem]',
  edge: 'end-[6.25rem]',
  firefox: 'end-14',
};

/** The accent the user chose for Gemini, when settings sync brought one over. */
function useGeminiAccent(): string | null {
  const [accent, setAccent] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    browser.storage.sync
      .get(StorageKeys.ACCENT_COLORS)
      .then((stored) => {
        const colors = stored[StorageKeys.ACCENT_COLORS];
        const value =
          colors && typeof colors === 'object'
            ? (colors as Record<string, unknown>)[GEMINI_SITE_ID]
            : undefined;
        if (!cancelled && typeof value === 'string' && value) setAccent(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return accent;
}

interface StepProps {
  number: number;
  title: string;
  done: boolean;
  doneLabel: string;
  active: boolean;
  last?: boolean;
  delay: number;
  children: React.ReactNode;
}

function Step({ number, title, done, doneLabel, active, last, delay, children }: StepProps) {
  return (
    <li
      aria-current={active ? 'step' : undefined}
      className="gv-welcome-enter relative flex gap-5 pb-10 last:pb-0"
      style={{ '--gv-delay': `${delay}ms` } as React.CSSProperties}
    >
      {!last && (
        <span aria-hidden="true" className="bg-border absolute start-4 top-9 bottom-0 w-px" />
      )}
      <div
        aria-hidden="true"
        className={[
          'gv-welcome-fade relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          done
            ? 'bg-primary text-primary-foreground'
            : active
              ? 'bg-card text-foreground ring-primary shadow-sm ring-2'
              : 'bg-secondary text-muted-foreground',
        ].join(' ')}
      >
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : number}
      </div>
      <div className={['min-w-0 flex-1 pt-0.5', done ? 'opacity-70' : ''].join(' ')}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-[-0.012em]">{title}</h2>
          {done && (
            <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
              {doneLabel}
            </span>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}

const OTHER_SITES: Array<{ label: string; icon: React.ReactNode }> = [
  { label: 'Gemini', icon: <IconGemini /> },
  { label: 'AI Studio', icon: <IconAIStudio /> },
  { label: 'Claude', icon: <IconClaude /> },
  { label: 'ChatGPT', icon: <IconChatGPT /> },
  { label: 'DeepSeek', icon: <IconDeepSeek /> },
];

export function Welcome() {
  const { t, language } = useLanguage();
  useDarkMode();
  const accent = useGeminiAccent();
  const pin = useToolbarPinState();
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    document.title = t('welcomeTitle');
    document.documentElement.dir = isRTLLanguage(language) ? 'rtl' : 'ltr';
    document.documentElement.lang = language.replace('_', '-');
    // `t` is derived from `language`; re-running on it alone is sufficient.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const pinBrowser = pin.browser;
  const showPinStep = pinBrowser !== 'unsupported';
  const pinned = pin.pinned === true;
  const waitingForPin = showPinStep && pin.ready && pin.pinned === false;

  const handleOpenGemini = async () => {
    setOpening(true);
    try {
      await focusOrOpenGemini();
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className="bg-background text-foreground min-h-screen"
      style={accent ? createPopupBrandThemeStyle(accent) : undefined}
    >
      {pinBrowser !== 'unsupported' && (
        <div
          aria-hidden="true"
          className={[
            'gv-welcome-fade text-primary pointer-events-none fixed top-2 z-10 flex flex-col items-center gap-0.5 text-sm font-semibold',
            ARROW_INSET_CLASS[pinBrowser],
            waitingForPin ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          <ArrowUp className="gv-welcome-arrow h-7 w-7" strokeWidth={2.25} />
          <span>{t('welcomeArrowLabel')}</span>
        </div>
      )}

      <div className="mx-auto w-full max-w-[640px] px-6 pt-8 pb-20 sm:px-10">
        {/* The entrance animation leaves a `filter` on every block, which makes
            each one a stacking context; the header must sit above the steps so
            its language menu is not painted under them. */}
        <header
          className="gv-welcome-enter relative z-20 flex items-center justify-between"
          style={{ '--gv-delay': '0ms' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5">
            <img src="/icon-128.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-primary text-lg font-extrabold tracking-tight">
              {t('extName')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <DarkModeToggle />
            <LanguageSelect />
          </div>
        </header>

        <div
          className="gv-welcome-enter mt-16 mb-12"
          style={{ '--gv-delay': '80ms' } as React.CSSProperties}
        >
          <h1 className="gv-welcome-title text-[2.5rem] leading-[1.1] font-extrabold">
            {t('welcomeTitle')}
          </h1>
          <p className="text-muted-foreground mt-3 text-lg">{t('welcomeSubtitle')}</p>
        </div>

        <ol className="list-none p-0">
          {showPinStep && (
            <Step
              number={1}
              title={t('welcomeStepPinTitle')}
              done={pinned}
              doneLabel={t('welcomeStepDone')}
              active={!pinned}
              delay={180}
            >
              <p className="gv-welcome-body text-muted-foreground mt-1.5 text-sm">
                {t('welcomeStepPinBody')}
              </p>
              <div className="mt-5">
                <ToolbarMock browser={pinBrowser} pinned={pinned} />
              </div>
              <p className="gv-welcome-body mt-4 text-sm">{t(PIN_STEPS_KEY[pinBrowser])}</p>
              {pin.pinned !== null && (
                <p
                  role="status"
                  aria-live="polite"
                  className={[
                    'mt-3 flex min-h-5 items-center gap-2 text-sm font-medium',
                    pinned ? 'text-primary' : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {pinned ? (
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="gv-welcome-live-dot bg-primary inline-block h-2 w-2 rounded-full"
                    />
                  )}
                  {pinned ? t('welcomePinDone') : t('welcomePinWaiting')}
                </p>
              )}
            </Step>
          )}

          <Step
            number={showPinStep ? 2 : 1}
            title={t('welcomeStepOpenTitle')}
            done={false}
            doneLabel={t('welcomeStepDone')}
            active={!showPinStep || pinned}
            last
            delay={showPinStep ? 280 : 180}
          >
            <p className="gv-welcome-body text-muted-foreground mt-1.5 text-sm">
              {t('welcomeStepOpenBody')}
            </p>
            <div className="mt-5">
              <Button
                size="lg"
                className="h-11 px-5 text-base font-semibold active:scale-[0.97]"
                onClick={() => void handleOpenGemini()}
                disabled={opening}
              >
                {t('welcomeOpenGemini')}
                <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-8">
              <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium">
                {OTHER_SITES.map((site) => (
                  <li key={site.label} className="flex items-center gap-1.5">
                    <span className="inline-flex h-3.5 w-3.5" aria-hidden="true">
                      {site.icon}
                    </span>
                    {site.label}
                  </li>
                ))}
              </ul>
              <p className="gv-welcome-body text-muted-foreground mt-2 text-xs">
                {t('welcomeOtherSites')}
              </p>
            </div>
          </Step>
        </ol>
      </div>
    </div>
  );
}
