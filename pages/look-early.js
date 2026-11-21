// Says on the root of the page which scheme and which shade the person
// chose (ADR-0008), before the page is drawn, so that a page never
// shows in another look first. It is no module: a module runs when the
// page has been read, and this runs where it stands, before the style
// sheet.
//
// What a person chose is kept in this browser. What nobody chose is
// Fado Standard in the light shade.

(() => {
  /** The schemes, each by its name and the words a person reads; tools/schemes.mjs works their colours out. */
  const SCHEMES = /** @type {[string, string][]} */ ([
    ['standard', 'Fado Standard'],
    ['ocean', 'Ocean'],
    ['meadow', 'Meadow'],
    ['sunset', 'Sunset'],
    ['rose', 'Rose'],
    ['graphite', 'Graphite'],
  ]);
  /** The shades a person chooses from; System is the shade their machine is in. */
  const MODES = /** @type {[string, string][]} */ ([
    ['light', 'Light'],
    ['dark', 'Dark'],
    ['system', 'System'],
  ]);
  const KEY = 'workshop.look';
  const dark = matchMedia('(prefers-color-scheme: dark)');

  /** What the person chose, as this browser keeps it. */
  function chosen() {
    /** @type {{ scheme?: unknown, mode?: unknown }} */
    let kept = {};
    try {
      kept = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
    } catch {
      // A browser that keeps nothing for a page, or kept something else: nothing was chosen.
    }
    return {
      scheme: SCHEMES.some(([name]) => name === kept.scheme) ? String(kept.scheme) : 'standard',
      mode: MODES.some(([name]) => name === kept.mode) ? String(kept.mode) : 'light',
    };
  }

  /** Says the choice on the root of the page. */
  function apply() {
    const { scheme, mode } = chosen();
    const root = document.documentElement;
    root.dataset.scheme = scheme;
    root.dataset.shade = mode === 'system' ? (dark.matches ? 'dark' : 'light') : mode;
  }

  /**
   * Keeps a choice and shows it at once.
   *
   * @param {{ scheme?: string, mode?: string }} look
   */
  function choose(look) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...chosen(), ...look }));
    } catch {
      // A browser that keeps nothing: the choice holds for this page.
      const root = document.documentElement;
      if (look.scheme) root.dataset.scheme = look.scheme;
      if (look.mode) root.dataset.shade = look.mode === 'system' ? (dark.matches ? 'dark' : 'light') : look.mode;
      return;
    }
    apply();
  }

  // The machine goes dark or light: a person who chose System follows it.
  dark.addEventListener('change', apply);
  // Another window of the same person: what is chosen there shows here too.
  addEventListener('storage', (told) => {
    if (told.key === KEY) apply();
  });
  apply();

  /** @type {any} */ (globalThis).workshopLook = { SCHEMES, MODES, chosen, choose };
})();
