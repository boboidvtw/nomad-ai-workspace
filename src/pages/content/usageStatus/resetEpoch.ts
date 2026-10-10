/**
 * Parse Gemini's localized usage reset label ("Resets at 5:00 PM", "6月3日 下午5:00")
 * into a local epoch so the pill can show a countdown.
 */

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLocalizedDigits(text: string, locale: string): string {
  let normalized = text.normalize('NFKC').replace(/\u00a0/g, ' ');
  try {
    const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
    for (let digit = 0; digit <= 9; digit += 1) {
      const localized = formatter
        .formatToParts(digit)
        .find((part) => part.type === 'integer')?.value;
      if (localized && localized !== String(digit)) {
        normalized = normalized.replaceAll(localized, String(digit));
      }
    }
  } catch {
    // Invalid/unsupported locale — ASCII digits still cover Gemini's fallback UI.
  }
  return normalized.toLocaleLowerCase(locale).replace(/\s+/g, ' ').trim();
}

function localizedDayPeriod(locale: string, hour: number): string {
  try {
    return (
      new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true })
        .formatToParts(new Date(2024, 0, 1, hour))
        .find((part) => part.type === 'dayPeriod')?.value ?? ''
    );
  } catch {
    return '';
  }
}

function parseLocalizedMonthDay(
  text: string,
  locale: string,
): { month: number; day: number } | null {
  for (const monthStyle of ['long', 'short', 'numeric'] as const) {
    for (let month = 0; month < 12; month += 1) {
      try {
        const parts = new Intl.DateTimeFormat(locale, {
          month: monthStyle,
          day: 'numeric',
        }).formatToParts(new Date(2024, month, 23, 12));
        if (!parts.some((part) => part.type === 'month')) continue;
        const pattern = parts
          .map((part) => {
            if (part.type === 'day') return '(\\d{1,2})';
            const value = normalizeLocalizedDigits(part.value, locale);
            if (part.type === 'literal' && !value) return '\\s*';
            return `${escapeRegex(value).replace(/\s+/g, '\\s*')}\\s*`;
          })
          .join('');
        const match = text.match(new RegExp(pattern, 'iu'));
        if (!match) continue;
        const day = Number(match[1]);
        if (day >= 1 && day <= 31) return { month, day };
      } catch {
        // Try the next representation; Intl can reject an unexpected locale.
      }
    }
  }
  return null;
}

/** Convert Gemini's localized reset text into a local epoch for the countdown. */
export function parseResetEpoch(
  text: string,
  now: number,
  locale: string = 'en',
): number | undefined {
  const normalized = normalizeLocalizedDigits(text, locale || 'en');
  const timeMatch = normalized.match(/(\d{1,2})\s*[:：.]\s*(\d{2})/u);
  if (!timeMatch) return undefined;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return undefined;

  const amTokens = [localizedDayPeriod(locale, 1), 'am', 'a.m.', '上午', '凌晨'];
  const pmTokens = [localizedDayPeriod(locale, 13), 'pm', 'p.m.', '下午', '晚上', '中午'];
  const hasToken = (tokens: string[]): boolean =>
    tokens.some((token) => token && normalized.includes(normalizeLocalizedDigits(token, locale)));
  if (hasToken(pmTokens) && hour < 12) hour += 12;
  else if (hasToken(amTokens) && hour === 12) hour = 0;

  const nowDate = new Date(now);
  const monthDay = [...new Set([locale || 'en', 'en', 'zh-CN', 'zh-TW'])]
    .map((candidateLocale) => parseLocalizedMonthDay(normalized, candidateLocale))
    .find((value) => value !== null);
  const candidate = monthDay
    ? new Date(nowDate.getFullYear(), monthDay.month, monthDay.day, hour, minute)
    : new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), hour, minute);

  if (monthDay) {
    // The UI omits the year. A January date shown in December belongs to next year.
    if (candidate.getTime() < now - 180 * 24 * 60 * 60_000) {
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
  } else if (candidate.getTime() <= now) {
    // A time-only reset label denotes the next occurrence in the user's timezone.
    candidate.setDate(candidate.getDate() + 1);
  }

  return Math.floor(candidate.getTime() / 1000);
}
