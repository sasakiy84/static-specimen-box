export function byId(id: string): HTMLElement;
export function byId<T extends HTMLElement>(id: string, kind: new () => T): T;
export function byId(id: string, kind?: new () => HTMLElement): HTMLElement {
  const node = document.getElementById(id);
  if (!node || (kind && !(node instanceof kind))) throw new Error(`画面要素がありません (${id})`);
  return node;
}

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export function button(label: string, className = ''): HTMLButtonElement {
  const element = node('button', className, label);
  element.type = 'button';
  return element;
}
