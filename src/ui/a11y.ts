/**
 * Keyboard and screen-reader helpers.
 *
 * A `disabled` button drops focus to the page the moment it is switched off, so a keyboard or
 * screen-reader user who presses "Sum up the difficulty" loses their place while it runs.
 * `aria-disabled` keeps focus where it is, still reads as unavailable, and a click does nothing.
 * A switched-off button can also be reached with Tab, so its reason (`aria-describedby`) is read out.
 */
export function offWhen(off: boolean, onClick: () => void): { 'aria-disabled'?: true; onClick?: () => void } {
  return off ? { 'aria-disabled': true } : { onClick };
}

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]';

/**
 * Move focus to the first element matching `selector` once React has drawn it: the result of an
 * action, or the heading of a new screen. Elements that can't take focus are given tabindex -1.
 */
export function focusSoon(selector: string): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    if (!el.matches(FOCUSABLE)) el.setAttribute('tabindex', '-1');
    el.focus();
  });
}
