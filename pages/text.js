// The text boxes of the design mode (ADR-0003).
//
// These are the only lines of Workshop that know CodeMirror. A page
// asks for a box and gets a few plain functions back: the text, a way
// to put another text in, a way to mark places in it and to show one.
// Whatever stands under the box can be changed here and nowhere else.
//
// Today there is one box: the code view, for a class as text. The
// formula editor comes with its own function.

import {
  EditorState,
  EditorView,
  HighlightStyle,
  bracketMatching,
  defaultKeymap,
  ensureSyntaxTree,
  highlightActiveLine,
  history,
  historyKeymap,
  indentOnInput,
  isolateHistory,
  json,
  keymap,
  lineNumbers,
  search,
  searchKeymap,
  setDiagnostics,
  syntaxHighlighting,
  tags,
} from './vendor/codemirror.js';

/**
 * A place in the text and what is said of it.
 *
 * @typedef {{ from: number, to: number, message: string }} Mark
 */

/**
 * A code view, as a page holds it.
 *
 * @typedef {object} CodeView
 * @property {() => string} text the text as it stands
 * @property {(text: string) => void} set puts another text in, as one change that can be undone
 * @property {(marks: Mark[]) => void} mark marks places in the text, each with what is said of it; none clears them
 * @property {(from: number, to: number) => void} show brings a place into view and puts the cursor there
 * @property {(path: string, pos?: number) => { from: number, to: number } | null} placeOf
 *   where the text holds the value a JSON pointer names, and, for a text
 *   value, the word that begins `pos` bytes into it; null when the text
 *   holds no such value
 * @property {() => number | null} fault where the text first stops being well-formed JSON, or null
 * @property {() => void} shown tells the box that it came into view: a box made while hidden has not measured itself
 */

/** The colours of a class as text, from the palette of the pages. */
const colours = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--blue-strong)' },
  { tag: tags.string, color: '#1F6B4F' },
  { tag: tags.number, color: '#8A4B00' },
  { tag: [tags.bool, tags.null], color: '#7A2318', fontWeight: '600' },
  { tag: [tags.separator, tags.squareBracket, tags.brace], color: 'var(--ink-2)' },
  { tag: tags.invalid, color: '#B4442F' },
]);

/** The look of the box: the page's own, not CodeMirror's. */
const look = EditorView.theme({
  '&': { backgroundColor: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: '8px', fontSize: '13px' },
  '&.cm-focused': { outline: '2px solid var(--blue)', outlineOffset: '2px' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6', maxHeight: '70vh', overflow: 'auto' },
  '.cm-content': { padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', border: '0', color: 'var(--ink-2)' },
  '.cm-activeLine': { backgroundColor: 'rgba(63, 116, 163, 0.07)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
});

/** The names of the nodes that are values in the tree of a JSON text. */
const VALUES = new Set(['Object', 'Array', 'String', 'Number', 'True', 'False', 'Null']);

/**
 * @param {string} pointer a JSON pointer: "", "/variables/vat/formula"
 * @returns {string[]}
 */
function steps(pointer) {
  if (pointer === '') return [];
  return pointer
    .split('/')
    .slice(1)
    .map((step) => step.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/**
 * Where a place inside a text value is in the text of the class: `pos`
 * bytes into the value, as the engine counts, and from there to the end
 * of the word. A text value is written between quotes, and some of its
 * characters are written as an escape of several.
 *
 * @param {string} written the value as it is written, with its quotes
 * @param {number} pos
 * @returns {{ from: number, to: number }} places inside `written`
 */
function inside(written, pos) {
  const encoder = new TextEncoder();
  /** Where each character of the value begins in what is written, and how many bytes it is. */
  /** @type {{ at: number, end: number, bytes: number, letter: string }[]} */
  const letters = [];
  for (let at = 1; at < written.length - 1; ) {
    let end = at + 1;
    let letter = written[at];
    if (letter === '\\') {
      end = written[at + 1] === 'u' ? at + 6 : at + 2;
      try {
        letter = JSON.parse(`"${written.slice(at, end)}"`);
      } catch {
        letter = '?';
      }
    } else if (written.charCodeAt(at) >= 0xd800 && written.charCodeAt(at) <= 0xdbff && at + 1 < written.length - 1) {
      // A character of two halves is one character to the engine.
      end = at + 2;
      letter = written.slice(at, end);
    }
    letters.push({ at, end, bytes: encoder.encode(letter).length, letter });
    at = end;
  }
  if (letters.length === 0) return { from: 0, to: written.length };
  let first = letters.length - 1;
  for (let seen = 0, i = 0; i < letters.length; i++) {
    if (seen >= pos) {
      first = i;
      break;
    }
    seen += letters[i].bytes;
  }
  let last = first;
  if (/[\p{L}\p{N}_.]/u.test(letters[first].letter)) {
    while (last + 1 < letters.length && /[\p{L}\p{N}_.]/u.test(letters[last + 1].letter)) last++;
  }
  return { from: letters[first].at, to: letters[last].end };
}

/**
 * Makes a code view for a class as text.
 *
 * @param {HTMLElement} parent where the box goes
 * @param {{ text: string, label: string, readOnly?: boolean, onChange?: () => void }} options
 *   label names the box for a screen reader; readOnly makes a box whose
 *   text can be read, selected and searched and not changed; onChange
 *   is told after every change of the text
 * @returns {CodeView}
 */
export function codeView(parent, { text, label, readOnly = false, onChange }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        indentOnInput(),
        search(),
        json(),
        syntaxHighlighting(colours),
        look,
        keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]),
        EditorState.readOnly.of(readOnly),
        EditorState.tabSize.of(2),
        EditorView.contentAttributes.of({ 'aria-label': label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) onChange();
        }),
      ],
    }),
  });

  /** The whole text read as JSON: its tree, with every place in it. */
  const tree = () => ensureSyntaxTree(view.state, view.state.doc.length, 5000);

  /**
   * The value a pointer names, as a node of the tree, as far down as
   * the text has it.
   *
   * @param {string[]} path
   */
  const find = (path) => {
    const top = tree()?.topNode;
    let node = top?.firstChild ?? null;
    while (node && !VALUES.has(node.name)) node = node.nextSibling;
    let whole = true;
    for (const step of path) {
      if (!node) break;
      /** @type {typeof node | null} */
      let next = null;
      if (node.name === 'Object') {
        for (let property = node.firstChild; property; property = property.nextSibling) {
          if (property.name !== 'Property') continue;
          const name = property.firstChild;
          if (!name) continue;
          let written = '';
          try {
            written = JSON.parse(view.state.sliceDoc(name.from, name.to));
          } catch {
            continue;
          }
          if (written !== step) continue;
          for (let value = name.nextSibling; value; value = value.nextSibling) if (VALUES.has(value.name)) next = value;
          next ??= property;
        }
      } else if (node.name === 'Array') {
        let index = 0;
        for (let value = node.firstChild; value; value = value.nextSibling) {
          if (!VALUES.has(value.name)) continue;
          if (String(index) === step) next = value;
          index++;
        }
      }
      if (!next) {
        whole = false;
        break;
      }
      node = next;
    }
    return node ? { node, whole } : null;
  };

  return {
    text: () => view.state.doc.toString(),

    set(next) {
      // A step of its own in the history of the box: undo takes back
      // this and nothing else, however soon after typing it came.
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, annotations: isolateHistory.of('full') });
    },

    mark(marks) {
      const length = view.state.doc.length;
      view.dispatch(
        setDiagnostics(
          view.state,
          marks.map((mark) => ({ from: Math.min(mark.from, length), to: Math.min(Math.max(mark.to, mark.from), length), severity: 'error', message: mark.message })),
        ),
      );
    },

    show(from, to) {
      const length = view.state.doc.length;
      view.dispatch({ selection: { anchor: Math.min(from, length), head: Math.min(to, length) }, scrollIntoView: true });
      view.focus();
    },

    placeOf(path, pos = -1) {
      const found = find(steps(path));
      if (!found) return null;
      const { node, whole } = found;
      if (whole && pos >= 0 && node.name === 'String') {
        const place = inside(view.state.sliceDoc(node.from, node.to), pos);
        return { from: node.from + place.from, to: node.from + place.to };
      }
      return { from: node.from, to: node.to };
    },

    shown() {
      view.requestMeasure();
    },

    fault() {
      /** @type {number | null} */
      let at = null;
      tree()?.iterate({
        enter(node) {
          if (at !== null) return false;
          if (node.type.isError) at = node.from;
          return undefined;
        },
      });
      return at;
    },
  };
}
