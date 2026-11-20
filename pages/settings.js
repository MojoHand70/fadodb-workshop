// The settings: what is the person's own. More is to stand here.

import { drawRail, readApps, settingsAddress } from './apps.js';
import { ACCOUNT } from './fado.js';
import { finder } from './finder.js';
import { crumbs, enter, part, ready, show } from './shell.js';

const user = await enter();
if (user) {
  try {
    const designer = (user.system_groups ?? []).includes('designers');
    const { apps, loose } = await readApps();
    drawRail(part('rail'), apps, loose.length > 0, settingsAddress);
    finder({ designer, apps });
    crumbs([{ words: 'Settings' }]);
    part('you-name').textContent = String(user.name || user.id);
    part('you-id').textContent = String(user.id);
    const groups = [...(user.system_groups ?? []), ...(user.groups ?? [])];
    part('you-groups').textContent = groups.join(', ');
    part('you-groups').hidden = groups.length === 0;
    part('you-groups-what').hidden = groups.length === 0;
    part('you-account').setAttribute('href', ACCOUNT);
    show('settings');
  } catch (refusal) {
    part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
    crumbs();
    show('trouble');
  }
  ready();
}
