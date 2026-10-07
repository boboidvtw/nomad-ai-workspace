import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEventActionButton } from '../eventActionButton';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createEventActionButton', () => {
  function create() {
    return createEventActionButton({
      className: 'gv-pm-width-btn',
      title: 'Adjust width',
      label: '↔️ Width',
      eventName: 'nomad:toggle-width-panel',
    });
  }

  it('renders a plain text button with the given class, title and label', () => {
    const button = create();

    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.className).toBe('gv-pm-width-btn');
    expect(button.title).toBe('Adjust width');
    expect(button.textContent).toBe('↔️ Width');
    expect(button.style.opacity).toBe('0.85');
  });

  it('brightens on hover and dims again on leave', () => {
    const button = create();

    button.dispatchEvent(new MouseEvent('mouseenter'));
    expect(button.style.opacity).toBe('1');
    button.dispatchEvent(new MouseEvent('mouseleave'));
    expect(button.style.opacity).toBe('0.85');
  });

  it('dispatches its window event on click without bubbling the click', () => {
    const button = create();
    const parentClick = vi.fn();
    const parent = document.createElement('div');
    parent.addEventListener('click', parentClick);
    parent.appendChild(button);
    document.body.appendChild(parent);
    const onEvent = vi.fn();
    window.addEventListener('nomad:toggle-width-panel', onEvent);

    button.click();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
    window.removeEventListener('nomad:toggle-width-panel', onEvent);
  });
});
