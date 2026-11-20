// Design mode for a class, in front of a real FadoDB server: Dan, a
// designer, reads the class Expense as lists and as text.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { fits, formulaOf, launch, open, ready, watch, writeFormula } from './browser.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** Where Workshop's pages answer: the server's own address. */
/** @type {{ url: string }} */
let site;
/** @type {import('playwright').Browser} */
let browser;
/** The class Expense as the tests define it. */
/** @type {any} */
let expense;
/** What a browser holds once Dan, and once Jan, has signed in. */
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let dan;
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let jan;

before(async () => {
  server = await acme();
  expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));
  await server.exec('define_class', { definition: expense });
  // A second version: what the class does by itself.
  expense.rules = [
    { on: 'transition', name: 'approve', do: [{ action: 'set', values: { note: 'note & " (seen)"' } }] },
    { on: 'create', if: 'net > 10000', do: [{ action: 'emit', event: 'large_expense' }] },
  ];
  await server.exec('define_class', { definition: expense });

  // A class that works values out and stores no documents, with no
  // sections, and with a line of the four left out.
  await server.exec('define_class', {
    definition: {
      name: 'Margin',
      label: 'Margin',
      description: 'What is left of a price.',
      variables: {
        price: { type: 'number', label: 'Price' },
        cost: { type: 'number', label: 'Cost' },
        margin: { formula: 'price - cost', label: 'Margin' },
      },
    },
  });

  // A class with a section inside a section, a pointer to another
  // class, a list of values, and rights given to a section.
  await server.exec('define_class', {
    definition: {
      name: 'Trip',
      label: 'Trip',
      description: 'A journey for the company.',
      title: 'where_to',
      variables: {
        where_to: { type: 'text', required: true, label: 'Where to' },
        by: { type: 'text', values: ['train', 'plane', 'car'], label: 'By', index: true },
        paid_with: { type: 'ref', class: 'Expense', label: 'Paid with' },
        street: { type: 'text', label: 'Street' },
        city: { type: 'text', label: 'City' },
        loose: { type: 'bool', label: 'Loose' },
      },
      sections: {
        journey: {
          label: 'The journey',
          description: 'Where and how.',
          variables: ['where_to', 'by', 'paid_with'],
          sections: { stay: { label: 'The stay', description: 'Where the person sleeps.', variables: ['street', 'city'] } },
        },
      },
      states: { initial: 'planned', list: ['planned', 'done'], final: ['done'], labels: { planned: 'Planned', done: 'Done' } },
      transitions: [{ name: 'finish', from: 'planned', to: 'done', label: 'Finish' }],
      access: { read: 'INGROUP("everyone")', create: 'INGROUP("everyone")', update: 'CREATEDBY() = USER()' },
      rights: { '*': { stay: { read: ['travel_office'], write: 'FALSE' } } },
    },
  });

  site = server.site;
  browser = await launch();
  for (const who of ['dan', 'jan']) {
    const context = await browser.newContext();
    await signIn(await context.newPage(), site, server, who);
    const held = await context.storageState();
    if (who === 'dan') dan = held;
    else jan = held;
    await context.close();
  }
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Somebody who is signed in opens a page.
 *
 * @param {typeof dan} who
 * @param {string} path
 * @param {{ width: number, height: number }} [viewport]
 */
async function at(who, path, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ storageState: who, viewport, locale: 'en-GB', timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await page.goto(site.url + path);
  await ready(page);
  return { context, page, ...seen };
}

/** @param {import('playwright').Page} page @param {string} selector */
const textsOf = (page, selector) => page.locator(selector).evaluateAll((all) => all.map((one) => (one.textContent ?? '').trim()));

/** The line "what: answer" of a list of lines, as two texts. */
/** @param {import('playwright').Locator} box */
const linesOf = (box) => box.locator('.line').evaluateAll((all) => all.map((one) => [one.querySelector('.line-what')?.textContent ?? '', one.querySelector('.line-answer')?.textContent ?? '']));

test('Dan, a designer, is offered Design beside each class and on a list; Jan is not', async () => {
  const first = await at(dan, 'app.html?unassigned');
  assert.deepEqual(await textsOf(first.page, '.tile-design-way'), ['Design', 'Design', 'Design', 'Design'], 'one for each class, none of which is in an app: Substitution, Expense, Margin, Trip');
  const way = first.page.locator('[data-class="Expense"] .tile-design-way');
  assert.equal(await way.getAttribute('href'), 'design.html?class=Expense');
  assert.equal(await way.getAttribute('aria-label'), 'Design Expense');
  assert.deepEqual(first.wrong, []);
  await first.context.close();

  const list = await at(dan, 'list.html?class=Expense');
  assert.ok(await list.page.locator('#design').isVisible());
  assert.equal(await list.page.locator('#design').getAttribute('href'), 'design.html?class=Expense');
  await list.context.close();

  const plain = await at(jan, 'app.html?unassigned');
  assert.equal(await plain.page.locator('.tile-design-way').count(), 0);
  assert.equal(await plain.page.locator('#lists .tile-name').count(), 4, 'and the ways to the lists are there');
  await plain.context.close();
  const janList = await at(jan, 'list.html?class=Expense');
  assert.ok(await janList.page.locator('#design').isHidden());
  assert.ok(await janList.page.locator('#new').isVisible());
  await janList.context.close();
});

test('Dan opens the design of Expense from Unassigned: its name, its version and who defined it', async () => {
  const { context, page, wrong, answers, commands } = await at(dan, 'app.html?unassigned');
  commands.length = 0;
  await page.locator('[data-class="Expense"] .tile-design-way').click();
  await page.waitForURL((address) => address.pathname === '/design.html');
  await ready(page);

  assert.equal(await page.title(), 'Design: Expense · FadoDB Workshop');
  assert.equal(await page.locator('#class-title').innerText(), 'Expense');
  assert.equal(await page.locator('#class-name').innerText(), 'Expense');
  assert.equal(await page.locator('#class-version').innerText(), 'version 2');
  assert.equal(await page.locator('#class-about').innerText(), expense.description);
  assert.match(await page.locator('#class-defined').innerText(), /^Defined by Olga Nowak, \d{1,2} \w{3} \d{4}, \d{2}:\d{2}$/);
  assert.equal(await page.locator('#to-list').getAttribute('href'), 'list.html?class=Expense');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Unassigned', 'Expense', 'Design']);
  // The line says what is so today: a part of the class that has got its lists since is no longer named as text only.
  assert.equal(await page.locator('.status').innerText(), 'Design mode: a designer changes a class as text and through the lists, writes its formulas with help, and tries it on a document before saving. Of what a class does by itself, setting a value and putting one back have their fields; any other action is changed in the text.');
  assert.deepEqual(commands, ['whoami', 'get_class', 'list_functions', 'get_user'], 'the page asks the server for the class, for what a formula can call, and for nothing else');
  assert.deepEqual(answers, []);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the variables are listed by the sections of the class, each with its kind in a line', async () => {
  const { context, page } = await at(dan, 'design.html?class=Expense');
  assert.deepEqual(await page.locator('#variables .part').evaluateAll((all) => all.map((p) => p.getAttribute('data-section'))), ['purchase', 'amounts']);
  assert.deepEqual(await textsOf(page, '#variables .part-title'), ['The purchase purchase', 'Amounts amounts']);
  assert.deepEqual(
    await page.locator('#variables .var').evaluateAll((all) => all.map((v) => v.getAttribute('data-variable'))),
    ['what', 'bought_on', 'cost_centre', 'note', 'net', 'vat_rate', 'vat', 'total', 'needs_director'],
  );
  /** @param {string} name */
  const row = (name) => page.locator(`.var[data-variable="${name}"]`);
  assert.equal(await row('what').locator('.var-label').innerText(), 'What was bought');
  assert.equal(await row('what').locator('.var-kind').innerText(), 'text, required');
  assert.equal(await row('what').locator('.var-about').innerText(), 'A few words a colleague would understand.');
  assert.equal(await row('bought_on').locator('.var-kind').innerText(), 'date, at first TODAY()');
  assert.equal(await row('vat_rate').locator('.var-kind').innerText(), 'decimal, 0 to 0.23, at first 0.23');
  assert.equal(await row('vat').locator('.var-kind').innerText(), 'fx ROUND(net * vat_rate, 2)');
  assert.equal(await row('needs_director').locator('.var-kind').innerText(), 'fx total > 5000');
  assert.deepEqual(await textsOf(page, '.var[data-variable="total"] .tag'), ['in The List', 'shown as #,##0.00']);
  assert.deepEqual(await textsOf(page, '.var[data-variable="note"] .tag'), []);
  await context.close();
});

test('the page opens on the state a new document starts in, with its ways out', async () => {
  const { context, page } = await at(dan, 'design.html?class=Expense');
  assert.deepEqual(await textsOf(page, '#states .pick .pick-label'), ['The whole class', 'Draft', 'Waiting for approval', 'Approved', 'Paid']);
  assert.deepEqual(await page.locator('#states .pick').evaluateAll((all) => all.map((b) => b.getAttribute('aria-pressed'))), ['false', 'true', 'false', 'false', 'false']);
  assert.deepEqual(await textsOf(page, '.pick[data-state="draft"] .tag'), ['a new document starts here']);
  assert.deepEqual(await textsOf(page, '.pick[data-state="paid"] .tag'), ['final']);

  assert.equal(await page.locator('#about-title').innerText(), 'Draft');
  assert.equal(await page.inputValue('#s-description'), 'Its author writes it and may change it.', 'for a designer what the state says is in a field');
  assert.deepEqual(await page.locator('#ways-out .way').evaluateAll((all) => all.map((w) => w.getAttribute('data-transition'))), ['submit']);
  const submit = page.locator('.way[data-transition="submit"]');
  assert.equal(await submit.locator('.way-head').innerText(), 'Submit submit to Waiting for approval');
  assert.deepEqual(await linesOf(submit), [['may take it', 'CREATEDBY() = USER()'], ['only when', 'total > 0']]);
  assert.match(await page.locator('#ways-in').innerText(), /A new document starts here\./);
  assert.deepEqual(await textsOf(page, '#ways-in li'), ['Take back, from Waiting for approval', 'Send back, from Waiting for approval']);
  assert.equal(await formulaOf(page, '#r-draft-0-write'), 'CREATEDBY() = USER()', 'for a designer who may set every variable here is a formula in a box');
  await context.close();
});

test('choosing a state shows its ways out, who may take each and who may set what there; the address keeps the choice', async () => {
  const { context, page, wrong, commands } = await at(dan, 'design.html?class=Expense');
  commands.length = 0;
  await page.click('.pick[data-state="submitted"]');
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval');
  assert.equal(await page.locator('.pick[data-state="submitted"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.pick[data-state="draft"]').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(await page.locator('#ways-out .way').evaluateAll((all) => all.map((w) => w.getAttribute('data-transition'))), ['take_back', 'send_back', 'approve']);

  const approve = page.locator('.way[data-transition="approve"]');
  assert.equal(await approve.locator('.way-head').innerText(), 'Approve approve to Approved');
  assert.equal(await approve.locator('.var-about').innerText(), 'An approver who is not its author accepts it; above 5,000, a director.');
  assert.deepEqual(await linesOf(approve), [['may take it', expense.access.transition.approve]], 'the formula whole, as the class writes it');
  assert.deepEqual(await textsOf(page, '#ways-in li'), ['Submit, from Draft']);

  const rights = page.locator('[data-rights="submitted"]');
  assert.deepEqual(await textsOf(page, '[data-rights="submitted"] .right-what'), ['Every variable', 'Note note']);
  assert.equal(await rights.locator('.formula-box').count(), 4, 'two boxes a line: who may set, who may see');
  assert.equal(await formulaOf(page, '#r-submitted-0-write'), 'FALSE');
  assert.equal(await formulaOf(page, '#r-submitted-note-write'), 'INGROUP("expense_approvers")', 'a list of groups, as the formula it means');

  const rules = page.locator('[data-rules="submitted"]');
  assert.equal(await rules.locator('.rule-when').innerText(), 'When Approve is taken');
  assert.deepEqual(await linesOf(rules), [['it does', 'set note = note & " (seen)"']]);

  assert.equal(new URL(page.url()).searchParams.get('state'), 'submitted');
  assert.deepEqual(commands, [], 'choosing a state asks the server nothing');
  await page.reload();
  await ready(page);
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval', 'the address opens the same state again');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a final state says that nothing leads out of it', async () => {
  const { context, page } = await at(dan, 'design.html?class=Expense&state=paid');
  assert.equal(await page.locator('#about-title').innerText(), 'Paid');
  assert.equal(await page.locator('#ways-out .way').count(), 0);
  assert.match(await page.locator('#ways-out').innerText(), /None\. This state is final/);
  assert.deepEqual(await textsOf(page, '#ways-in li'), ['Record payment, from Approved']);
  assert.match(await page.locator('#about').innerText(), /No line here, and none for every state: whoever may change a document may set every value in it\./);
  await context.close();
});

test('the whole class: who may see, make, change and delete a document, each formula whole', async () => {
  const { context, page } = await at(dan, 'design.html?class=Expense');
  await page.click('.pick[data-state=""]');
  assert.equal(await page.locator('#about-title').innerText(), 'The whole class');
  // For a designer each line is a field that holds the formula whole.
  assert.equal(await formulaOf(page, '#c-read'), expense.access.read);
  assert.equal(await formulaOf(page, '#c-create'), 'INGROUP("everyone")');
  assert.equal(await formulaOf(page, '#c-update'), expense.access.update);
  assert.equal(await formulaOf(page, '#c-delete'), 'FALSE');
  assert.equal(await formulaOf(page, '#c-title'), 'what');
  const rules = page.locator('[data-rules=""]');
  assert.equal(await rules.locator('.rule-when').innerText(), 'When a document is made');
  assert.deepEqual(await linesOf(rules), [['only when', 'net > 10000'], ['it does', 'emit (event: large_expense)']]);
  assert.equal(new URL(page.url()).searchParams.get('state'), null, 'the whole class is the address with no state');
  await context.close();
});

test('the same class as text is the definition the server holds, word for word', async () => {
  // A window tall enough for the box to show every line: the box draws only the lines in view.
  const { context, page, wrong } = await at(dan, 'design.html?class=Expense', { width: 1280, height: 9000 });
  assert.ok(await page.locator('#lists').isVisible());
  assert.ok(await page.locator('#text').isHidden());
  await page.click('#as-text');
  assert.ok(await page.locator('#text').isVisible());
  assert.ok(await page.locator('#lists').isHidden());
  assert.equal(await page.locator('#as-text').getAttribute('aria-pressed'), 'true');
  const { class: held } = await server.exec('get_class', { name: 'Expense' });
  // The box draws its lines a moment after it comes into view.
  await page.waitForFunction(() => {
    try {
      return Boolean(JSON.parse(/** @type {HTMLElement} */ (document.querySelector('#class-text .cm-content')).innerText));
    } catch {
      return false;
    }
  });
  assert.deepEqual(JSON.parse(await page.locator('#class-text .cm-content').innerText()), held.definition);
  assert.equal(await page.locator('#class-text .cm-content').getAttribute('aria-label'), 'The definition of the class');
  assert.ok(await page.locator('#class-changed').isHidden(), 'the text is what the server holds: nothing is changed');
  assert.equal(new URL(page.url()).searchParams.get('as'), 'text');
  await page.reload();
  await ready(page);
  assert.ok(await page.locator('#text').isVisible(), 'the address opens the text again');
  await page.click('#as-lists');
  assert.ok(await page.locator('#lists').isVisible());
  assert.equal(new URL(page.url()).searchParams.get('as'), null);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a class with no states and no sections is shown as what it is', async () => {
  const { context, page, wrong } = await at(dan, 'design.html?class=Margin');
  assert.equal(await page.locator('#class-version').innerText(), 'version 1');
  assert.deepEqual(await page.locator('#variables .var').evaluateAll((all) => all.map((v) => v.getAttribute('data-variable'))), ['price', 'cost', 'margin']);
  assert.equal(await page.locator('#variables .part-title').count(), 0, 'no heading where the class has no sections');
  assert.deepEqual(await textsOf(page, '#states .pick .pick-label'), ['The whole class']);
  assert.match(await page.locator('#states-about').innerText(), /no states: it stores no documents/);
  assert.equal(await page.locator('#about-title').innerText(), 'The whole class');
  for (const line of ['read', 'create', 'update', 'delete']) assert.equal(await formulaOf(page, `#c-${line}`), '', `the class leaves the line ${line} out`);
  assert.deepEqual(wrong, []);
  await context.close();

  // Somebody who only reads is told in words what an empty line means.
  const reader = await at(jan, 'design.html?class=Margin');
  assert.deepEqual(await linesOf(reader.page.locator('#about .inner').first()), [
    ['See a document', 'nobody: the class leaves this line out'],
    ['Make a new one', 'nobody: the class leaves this line out'],
    ['Change its values', 'nobody: the class leaves this line out'],
    ['Delete it', 'nobody: the class leaves this line out'],
  ]);
  await reader.context.close();
});

test('a section inside a section, a pointer, a list of values and the rights of a section', async () => {
  const { context, page, wrong } = await at(dan, 'design.html?class=Trip');
  assert.deepEqual(await page.locator('#variables .part').evaluateAll((all) => all.map((p) => p.getAttribute('data-section'))), [null, 'journey', 'stay']);
  assert.deepEqual(await textsOf(page, '#variables .part-title'), ['In no section', 'The journey journey', 'The stay stay']);
  assert.equal(await page.locator('.part[data-section="journey"] .part[data-section="stay"] .var').count(), 2, 'the stay is inside the journey');
  assert.equal(await page.locator('.var[data-variable="loose"]').locator('xpath=ancestor::section[1]').getAttribute('data-section'), null);
  assert.equal(await page.locator('.var[data-variable="by"] .var-kind').innerText(), 'text, one of train, plane, car');
  assert.deepEqual(await textsOf(page, '.var[data-variable="by"] .tag'), ['indexed']);
  assert.equal(await page.locator('.var[data-variable="paid_with"] .var-kind').innerText(), 'ref to Expense');

  // Planned: one way out, with no line of its own.
  assert.deepEqual(await linesOf(page.locator('.way[data-transition="finish"]')), [
    ['may take it', 'whoever may change the document: the class keeps no line for this move, so its line for changing is asked'],
  ]);
  assert.deepEqual(await textsOf(page, '[data-rights="*"] .right-what'), ['The stay stay a section']);
  assert.deepEqual(await linesOf(page.locator('[data-rights="*"]')), [['may set it', 'FALSE'], ['may see it', 'anybody in travel_office']]);

  await page.click('.pick[data-state=""]');
  assert.equal(await formulaOf(page, '#c-delete'), '', 'the class leaves the line for deleting out');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what a class says is shown as text, never run as markup', async () => {
  const trap = '<img src=x onerror="document.title=1">';
  await server.exec('define_class', {
    definition: {
      name: 'Trap',
      label: trap,
      description: '<script>document.title = "run"</script>',
      title: `"${trap.replaceAll('"', "'")}" & note`,
      variables: { note: { type: 'text', label: '<b>bold</b>', description: trap, format: '' } },
      sections: { all: { label: '<i>section</i>', description: trap, variables: ['note'] } },
      states: { initial: 'open', list: ['open', 'shut'], labels: { open: '<u>Open</u>', shut: trap }, descriptions: { open: trap } },
      transitions: [{ name: 'shut', from: 'open', to: 'shut', label: trap, description: trap, guard: `note = "${trap.replaceAll('"', "'")}"` }],
      access: { read: 'TRUE', create: 'TRUE', update: 'TRUE', delete: 'FALSE' },
    },
  });
  const { context, page, wrong } = await at(dan, 'design.html?class=Trap');
  assert.equal(await page.locator('#class-title').innerText(), trap);
  assert.equal(await page.locator('.var[data-variable="note"] .var-label').innerText(), '<b>bold</b>');
  assert.equal(await page.locator('.pick[data-state="open"] .pick-label').innerText(), '<u>Open</u>');
  assert.equal(await page.locator('.way[data-transition="shut"] .way-label').innerText(), trap);
  await page.click('.pick[data-state=""]');
  await page.click('#as-text');
  assert.match(await page.locator('#class-text .cm-content').innerText(), /<script>document\.title = \\"run\\"<\/script>/);
  assert.equal(await page.title(), `Design: ${trap} · FadoDB Workshop`, 'the title of the tab is the label as text, and no script changed it');
  assert.equal(await page.locator('#design img:not(.cm-widgetBuffer), #design script, #design b, #design i, #design u').count(), 0);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the design fits a phone and is worked by the keyboard', async () => {
  const { context, page, wrong } = await at(dan, 'design.html?class=Expense', { width: 390, height: 844 });
  assert.ok(await fits(page), 'the lists do not scroll sideways at 390 px');
  await page.click('.pick[data-state="submitted"]');
  assert.ok(await fits(page), 'nor with the longest formula of the class shown');
  await page.click('#as-text');
  assert.ok(await fits(page), 'the text scrolls inside its own box');

  await page.click('#as-lists');
  await page.locator('.pick[data-state="approved"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#about-title').innerText(), 'Approved');
  await page.locator('#as-text').focus();
  await page.keyboard.press('Space');
  assert.ok(await page.locator('#text').isVisible());
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a class the server does not know is answered in the server\'s words', async () => {
  const { context, page, wrong, answers } = await at(dan, 'design.html?class=Nothing');
  assert.ok(await page.locator('#trouble').isVisible());
  assert.ok(await page.locator('#design').isHidden());
  assert.match(await page.locator('#trouble-why').innerText(), /Nothing/);
  assert.deepEqual(answers.map((a) => a.path), ['/v1/get_class']);
  assert.deepEqual(wrong, []);
  await context.close();

  const none = await at(dan, 'design.html');
  assert.match(await none.page.locator('#trouble-why').innerText(), /The address names no class/);
  await none.context.close();
});

test('a state the class does not have is not taken from the address', async () => {
  const { context, page } = await at(dan, 'design.html?class=Expense&state=nowhere');
  assert.equal(await page.locator('#about-title').innerText(), 'Draft');
  await context.close();
});

test('a person who is not signed in is offered to sign in, and comes back to the design', async () => {
  const { context, page, wrong } = await open(browser, `${site.url}design.html?class=Expense&state=submitted`);
  assert.ok(await page.locator('#signed-out').isVisible());
  assert.equal(await page.locator('#sign-in').getAttribute('href'), `/auth/signin?next=${encodeURIComponent('/design.html?class=Expense&state=submitted')}`);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan, who is no designer, may read a design he opens by its address, and can change nothing in it', async () => {
  const { context, page, wrong, answers } = await at(jan, 'design.html?class=Expense');
  assert.equal(await page.locator('#class-title').innerText(), 'Expense');
  assert.equal(await page.locator('#variables .var').count(), 9);
  assert.ok(await page.locator('#design-do').isHidden(), 'no Check, no Discard, no Save');

  // He reads a state and the whole class in words; nothing is a field or a button to change.
  assert.equal(await page.locator('#about-what').innerText(), 'Its author writes it and may change it.');
  assert.equal(await page.locator('#about input, #about textarea, #about select, #about button').count(), 0);
  assert.equal(await page.locator('.way[data-transition="submit"] .way-head').evaluate((head) => head.tagName), 'P');
  await page.click('.pick[data-state=""]');
  assert.deepEqual(await linesOf(page.locator('#about .inner').first()), [
    ['See a document', expense.access.read],
    ['Make a new one', 'INGROUP("everyone")'],
    ['Change its values', expense.access.update],
    ['Delete it', 'FALSE'],
  ]);
  assert.match(await page.locator('#about').innerText(), /The title of a document/);
  assert.equal(await page.locator('#about input, #about textarea, #about select, #about button').count(), 0);
  assert.equal(await page.locator('.adder').count(), 0);
  await page.click('.pick[data-state="draft"]');
  await page.click('#as-text');
  assert.match(await page.locator('#text-about').innerText(), /Changing a class is for a designer/);
  await page.locator('#class-text .cm-content').click();
  await page.keyboard.type('x');
  assert.ok(await page.locator('#class-changed').isHidden(), 'typing changes nothing');
  assert.deepEqual(answers, []);
  assert.deepEqual(wrong, []);
  await context.close();
});
