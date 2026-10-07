const IDLE_OPACITY = '0.85';

/**
 * A small text button for the prompt manager's secondary action row that
 * announces itself by dispatching `eventName` on `window` when clicked.
 */
export function createEventActionButton({
  className,
  title,
  label,
  eventName,
}: {
  className: string;
  title: string;
  label: string;
  eventName: string;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = title;
  button.textContent = label;
  Object.assign(button.style, {
    fontSize: '12px',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    padding: '0 6px',
    color: 'inherit',
    opacity: IDLE_OPACITY,
    transition: 'opacity 0.15s ease',
  });
  button.addEventListener('mouseenter', () => {
    button.style.opacity = '1';
  });
  button.addEventListener('mouseleave', () => {
    button.style.opacity = IDLE_OPACITY;
  });
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent(eventName));
  });
  return button;
}
