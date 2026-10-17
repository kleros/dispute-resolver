/**
 * The Kleros UI components library defines its light and dark colour tokens on `:root` and `:root.dark`,
 * so the colour scheme is a `dark` class on the root element.
 */
export function applyColorScheme(root: HTMLElement, prefersDark: boolean): void {
  root.classList.toggle("dark", prefersDark);
}
