// The first page: what the server holds that the person may open.
//
// A person opens a list by the name its documents go by. That there is
// a class behind each list is the designer's to know: its name, the way
// to its design and the making of a new one are shown to a designer
// alone.

import { call } from './fado.js';
import { found } from './find.js';
import { enter, make, part, ready, show } from './shell.js';

/** What the page lists, each with what it says of itself and its row on the page. */
/** @type {{ says: string[], item: HTMLElement, way: HTMLAnchorElement }[]} */
let listed = [];

/**
 * The lists a person may open, each with the words its class says to
 * people. A class whose definition the person may not read is shown by
 * its name alone. A designer gets the name of each class and a way to
 * its design beside it.
 *
 * @param {boolean} designer
 */
async function showClasses(designer) {
  const { classes } = await call('list_classes');
  /** @type {string[]} */
  const names = Array.isArray(classes) ? classes : [];
  const all = await Promise.all(
    names.map((name) =>
      call('get_class', { name }).then(
        (answer) => ({ name, definition: answer?.class?.definition ?? {} }),
        () => ({ name, definition: {} }),
      ),
    ),
  );
  const list = part('classes');
  list.replaceChildren();
  listed = [];
  for (const { name, definition } of all) {
    // A list goes by the word for many of its documents, where the class has one.
    const label = String(definition.plural || definition.label || name);
    const about = String(definition.description || '');
    const way = /** @type {HTMLAnchorElement} */ (make('a', 'class-way'));
    way.setAttribute('href', `list.html?class=${encodeURIComponent(name)}`);
    const head = make('div', 'class-head');
    head.append(make('span', 'class-label', label));
    if (designer) head.append(make('code', 'class-name', name));
    way.append(head);
    if (about) way.append(make('p', 'class-about', about));
    const item = make('li', 'class');
    item.dataset.class = name;
    item.append(way);
    if (designer) {
      const design = make('a', 'class-design', 'Design');
      design.setAttribute('href', `design.html?class=${encodeURIComponent(name)}`);
      design.setAttribute('aria-label', `Design ${String(definition.label || name)}`);
      item.append(design);
    }
    list.append(item);
    // A designer knows a class by its name too, and finds it by that.
    listed.push({ says: designer ? [label, String(definition.label || ''), about, name] : [label, about], item, way });
  }
  const none = part('no-classes');
  none.hidden = names.length > 0;
  none.textContent = designer ? 'There is no class here yet. "New class" makes the first one.' : 'There is nothing here for you yet.';
  part('find-box').hidden = names.length === 0;
}

/** Shows of what is listed only what the person typed a part of. */
function narrow() {
  const typed = /** @type {HTMLInputElement} */ (part('find')).value;
  let left = 0;
  for (const one of listed) {
    const is = found(one.says, typed);
    one.item.hidden = !is;
    if (is) left++;
  }
  const none = part('none-found');
  none.hidden = left > 0 || listed.length === 0;
  none.textContent = none.hidden ? '' : `Nothing here goes by "${typed.trim()}".`;
}

const user = await enter();
if (user) {
  const designer = (user.system_groups ?? []).includes('designers');
  part('new-class').hidden = !designer;
  await showClasses(designer);
  const find = /** @type {HTMLInputElement} */ (part('find'));
  find.addEventListener('input', narrow);
  // Enter opens the first that is left: a name typed and Enter is the short way in.
  find.addEventListener('keydown', (key) => {
    if (key.key !== 'Enter' || key.isComposing || find.value.trim() === '') return;
    const first = listed.find((one) => !one.item.hidden);
    if (first) location.assign(first.way.href);
  });
  // A browser that brings the person back may bring what they had typed too.
  narrow();
  show('home');
  ready();
}
