import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPromptTooltip } from '../promptTooltip';

function setup(renderMarkdown: (text: string) => Promise<string | null>) {
  const panel = document.createElement('div');
  panel.setAttribute('data-gv-theme', 'dark');
  const list = document.createElement('div');
  const row = document.createElement('button');
  list.appendChild(row);
  panel.appendChild(list);
  document.body.appendChild(panel);
  const tooltip = createPromptTooltip({ panel, scrollTargets: [list, window], renderMarkdown });
  tooltip.attach(row, 'Hello **world**');
  return { panel, list, row, tooltip };
}

const tooltipEl = () => document.querySelector<HTMLElement>('.gv-pm-tooltip');

describe('createPromptTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens after the hover delay with the raw text, then the rendered Markdown', async () => {
    const { row } = setup(async () => '<p>Hello <strong>world</strong></p>');

    row.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltipEl()).toBeNull();
    vi.advanceTimersByTime(250);

    const el = tooltipEl();
    expect(el?.classList.contains('gv-pm-tooltip-visible')).toBe(true);
    expect(el?.getAttribute('data-gv-theme')).toBe('dark');
    await vi.runAllTimersAsync();
    expect(el?.querySelector('strong')?.textContent).toBe('world');
    expect(el?.querySelector('.gv-md')?.classList.contains('gv-pm-tooltip-raw')).toBe(false);
  });

  it('never opens when the pointer leaves before the delay', () => {
    const { row } = setup(async () => null);

    row.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(100);
    row.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(500);

    expect(tooltipEl()?.classList.contains('gv-pm-tooltip-visible') ?? false).toBe(false);
  });

  it('stays open while the pointer crosses onto the tooltip, and hides after leaving it', () => {
    const { row } = setup(async () => null);
    row.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(250);
    const el = tooltipEl() as HTMLElement;

    row.dispatchEvent(new MouseEvent('mouseleave'));
    el.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(500);
    expect(el.classList.contains('gv-pm-tooltip-visible')).toBe(true);

    el.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(150);
    expect(el.classList.contains('gv-pm-tooltip-visible')).toBe(false);
  });

  it('keeps the raw text when Markdown arrives after the preview was dismissed', async () => {
    let resolve: (html: string) => void = () => {};
    const { row, tooltip } = setup(() => new Promise((r) => (resolve = r)));
    row.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(250);

    tooltip.hide();
    resolve('<p>late</p>');
    await vi.runAllTimersAsync();

    expect(tooltipEl()?.textContent).toBe('Hello **world**');
  });

  it('opens rendered links in a new tab so the chat page stays put', async () => {
    const { row } = setup(async () => '<a href="https://example.com">x</a>');
    row.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(250);
    await vi.runAllTimersAsync();

    const link = tooltipEl()?.querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('hides when the list scrolls, but not when the tooltip itself scrolls', () => {
    const { row, list } = setup(async () => null);
    row.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(250);
    const el = tooltipEl() as HTMLElement;

    el.dispatchEvent(new Event('scroll'));
    expect(el.classList.contains('gv-pm-tooltip-visible')).toBe(true);
    list.dispatchEvent(new Event('scroll'));
    expect(el.classList.contains('gv-pm-tooltip-visible')).toBe(false);
  });

  it('destroy removes the element and stops listening to scrolls', () => {
    const { row, tooltip } = setup(async () => null);
    row.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(250);
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    tooltip.destroy();

    expect(tooltipEl()).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true });
  });
});
