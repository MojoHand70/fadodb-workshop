// The first page: the classes on the server that the person may see.

import { call } from './fado.js';
import { enter, make, part, ready, show } from './shell.js';

/**
 * The classes, each with the words its class says to people and a way
 * to its list. A class whose definition the person may not read is
 * shown by its name alone. A designer gets a way to the design of each
 * class beside it.
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
  for (const { name, definition } of all) {
    const way = make('a', 'class-way');
    way.setAttribute('href', `list.html?class=${encodeURIComponent(name)}`);
    const head = make('div', 'class-head');
    head.append(make('span', 'class-label', String(definition.label || name)), make('code', 'class-name', name));
    way.append(head);
    if (definition.description) way.append(make('p', 'class-about', String(definition.description)));
    const item = make('li', 'class');
    item.append(way);
    if (designer) {
      const design = make('a', 'class-design', 'Design');
      design.setAttribute('href', `design.html?class=${encodeURIComponent(name)}`);
      design.setAttribute('aria-label', `Design ${String(definition.label || name)}`);
      item.append(design);
    }
    list.append(item);
  }
  part('no-classes').hidden = names.length > 0;
}

const user = await enter();
if (user) {
  const designer = (user.system_groups ?? []).includes('designers');
  part('new-class').hidden = !designer;
  await showClasses(designer);
  show('home');
  ready();
}
