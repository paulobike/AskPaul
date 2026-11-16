/**
 * <ask-paul> — the embeddable widget.
 *
 *   <script type="module" src="https://YOUR-CDN/ask-paul.js"></script>
 *   <ask-paul api-url="https://YOUR-API" page-context="Vennote case study"></ask-paul>
 *
 * Attributes
 *   api-url       where the API lives (required)
 *   mode          "launcher" (default: floating button + panel) or "inline" (fills its container)
 *   page-context  what the visitor is reading, passed to the agent as context
 *   no-fonts      don't load the web fonts (use the host page's)
 *
 * This file stays tiny: in launcher mode it draws only the button, and the
 * chat code is fetched the first time the visitor opens it (or hovers it).
 * Everything renders inside a Shadow DOM, so no styles leak in or out.
 * Colours can be overridden from the host page with --ap-* custom properties.
 */

const LAUNCHER_CSS = `
:host { all: initial; }
.launcher { position: fixed; right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom)); z-index: 2147483000;
  display: inline-flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 20px 0 8px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--ap-text, #E8EDF3); color: var(--ap-ink, #0D1218); font: 800 15px/1 var(--ap-font-body, Nunito, system-ui, sans-serif);
  box-shadow: 0 12px 30px rgba(0,0,0,.4); transition: transform .2s ease; }
.launcher[hidden] { display: none; }
.launcher:hover { transform: translateY(-2px); }
.launcher:focus-visible { outline: 3px solid var(--ap-accent, #F5B544); outline-offset: 3px; }
.dot { width: 40px; height: 40px; border-radius: 50%; background: var(--ap-accent, #F5B544); display: flex; align-items: center; justify-content: center; }
@media (max-width: 640px) { .launcher { padding: 0; width: 60px; height: 60px; justify-content: center; background: var(--ap-accent, #F5B544); }
  .label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); } .dot { background: transparent; } }
@media (prefers-reduced-motion: reduce) { .launcher { transition: none; } }
`;

const SPARK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D1218" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/></svg>`;

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..700,0..100,0..1;1,9..144,300..700,0..100,0..1&family=Nunito:wght@400;600;700;800&display=swap';

type AppModule = typeof import('./app.js');
let appModule: Promise<AppModule> | null = null;
const loadApp = () => (appModule ??= import('./app.js'));

function ensureFonts() {
  if (document.querySelector('link[data-ask-paul-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONTS_HREF;
  link.dataset.askPaulFonts = '';
  document.head.appendChild(link);
}

export class AskPaulElement extends HTMLElement {
  static observedAttributes = ['page-context'];
  private root: ShadowRoot;
  private host: HTMLDivElement | null = null;
  private launcher: HTMLButtonElement | null = null;
  private unmount: (() => void) | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  get apiUrl() {
    return this.getAttribute('api-url') ?? '';
  }
  get mode(): 'launcher' | 'inline' {
    return this.getAttribute('mode') === 'inline' ? 'inline' : 'launcher';
  }

  connectedCallback() {
    if (!this.hasAttribute('no-fonts')) ensureFonts();
    if (!this.apiUrl) console.warn('<ask-paul>: set the api-url attribute.');
    if (this.mode === 'inline') void this.open();
    else this.renderLauncher();
  }

  disconnectedCallback() {
    this.unmount?.();
    this.unmount = null;
  }

  attributeChangedCallback() {
    // Page context changes apply to the next opening.
  }

  private renderLauncher() {
    this.root.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = LAUNCHER_CSS;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'launcher';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.innerHTML = `<span class="dot">${SPARK}</span><span class="label">Ask Paul</span>`;
    btn.addEventListener('click', () => void this.open());
    // Start fetching the chat code as soon as the visitor shows intent.
    btn.addEventListener('pointerenter', () => void loadApp(), { once: true });
    btn.addEventListener('focus', () => void loadApp(), { once: true });
    this.root.append(style, btn);
    this.launcher = btn;
  }

  async open() {
    const { mount, styles } = await loadApp();
    if (!this.host) {
      const style = document.createElement('style');
      style.textContent = styles;
      this.host = document.createElement('div');
      this.host.className = 'ap-root';
      this.root.append(style, this.host);
    }
    if (this.launcher) this.launcher.hidden = true;
    const pageContext = this.getAttribute('page-context') ?? undefined;
    this.unmount = mount(this.host, {
      apiUrl: this.apiUrl,
      mode: this.mode,
      ...(pageContext ? { pageContext } : {}),
      onClose: () => {
        if (this.launcher) {
          this.launcher.hidden = false;
          this.launcher.focus();
        }
      },
    });
  }
}

if (!customElements.get('ask-paul')) customElements.define('ask-paul', AskPaulElement);
