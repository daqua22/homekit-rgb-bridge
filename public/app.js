/* All dynamic values enter the DOM as text or input values, never HTML. */
const $ = (id) => document.getElementById(id);
let token =
  new URLSearchParams(location.hash.slice(1)).get('token') ||
  sessionStorage.getItem('bridge-token');
if (token) {
  sessionStorage.setItem('bridge-token', token);
  history.replaceState(null, '', location.pathname);
}
const pendingLightWrites = new Map();
function sendLightState(id, state) {
  let pending = pendingLightWrites.get(id);
  if (!pending) {
    pending = { state: {}, timer: undefined };
    pendingLightWrites.set(id, pending);
  }
  Object.assign(pending.state, state);
  clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    pendingLightWrites.delete(id);
    action(() => api('light', { id, state: pending.state }));
  }, 50);
}
let config,
  revision,
  inventory = [],
  draftDevices = [],
  draftGroups = [],
  dirty = false;
const message = (text) => {
  $('message').textContent = text;
};
function el(tag, text) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
}
async function api(path, body) {
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Operation failed');
  return data;
}
async function action(fn) {
  try {
    await fn();
  } catch (error) {
    message(error.message);
  }
}
function targetLabel(id) {
  for (const d of inventory) {
    if (d.id === id) return d.name;
    for (const z of d.zones) if (z.id === id) return d.name + ' / ' + z.name;
  }
  return draftDevices.find((d) => d.id === id)?.name || id;
}
function targets() {
  return inventory.flatMap((d) => [
    { id: d.id, name: d.name },
    ...d.zones
      .filter((z) => z.controllable && z.id && config.experimentalZones)
      .map((z) => ({ id: z.id, name: d.name + ' / ' + z.name })),
  ]);
}
function checkbox(label, checked, change, marksDirty = true) {
  const l = el('label');
  l.className = 'check';
  const c = el('input');
  c.type = 'checkbox';
  c.checked = checked;
  c.addEventListener('change', () => {
    if (marksDirty) dirty = true;
    change(c.checked);
  });
  l.append(c, el('span', label));
  return { label: l, input: c };
}
function selectTarget(container, id, name, supported = true) {
  const row = el('div');
  row.className = 'target-row';
  let selected = draftDevices.find((d) => d.id === id);
  const check = checkbox(name, selected?.enabled ?? false, (enabled) => {
    selected = draftDevices.find((d) => d.id === id);
    if (selected) selected.enabled = enabled;
    else draftDevices.push({ id, name: input.value, enabled });
  });
  check.input.disabled = !supported;
  const label = el('label', 'HomeKit name');
  const input = el('input');
  input.maxLength = 64;
  input.value =
    selected?.name ??
    (name
      .replace(/[^A-Za-z0-9 '-]/g, '')
      .slice(0, 64)
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '') ||
      'RGB Light');
  input.addEventListener('input', () => {
    dirty = true;
    let d = draftDevices.find((d) => d.id === id);
    if (!d) {
      d = { id, name: input.value, enabled: false };
      draftDevices.push(d);
    }
    d.name = input.value;
  });
  label.append(input);
  row.append(check.label, label);
  container.append(row);
}
function renderDevices() {
  const root = $('devices');
  root.replaceChildren();
  for (const d of inventory) {
    const block = el('article');
    block.className = 'device';
    block.append(
      el('h3', d.name),
      el(
        'p',
        d.manufacturer +
          ' · ID ' +
          d.id.slice(-8) +
          ' · ' +
          d.zones.reduce((n, z) => n + z.ledCount, 0) +
          (d.capabilities.color
            ? ' LEDs · RGB / software brightness / black-as-off'
            : ' LEDs · unsupported color control'),
      ),
    );
    selectTarget(block, d.id, d.name, d.capabilities.color);
    if (d.capabilities.reason) block.append(el('p', d.capabilities.reason));
    for (const z of d.zones) {
      const zone = el('div');
      zone.className = 'zone';
      if (z.id && config.experimentalZones)
        selectTarget(zone, z.id, z.name, z.controllable);
      else zone.append(el('p', z.name + ' · ' + z.ledCount + ' LEDs'));
      if (z.reason) zone.append(el('small', z.reason));
      block.append(zone);
    }
    root.append(block);
  }
  const saved = $('saved-devices');
  saved.replaceChildren();
  const found = new Set(
    inventory.flatMap((d) => [d.id, ...d.zones.map((z) => z.id)]),
  );
  for (const d of draftDevices.filter((d) => !found.has(d.id))) {
    const b = el('div');
    b.className = 'device';
    b.append(el('p', 'Saved target (not currently discovered): ' + d.name));
    selectTarget(b, d.id, d.name);
    saved.append(b);
  }
  renderGroups();
}
function renderGroups() {
  const root = $('groups');
  root.replaceChildren();
  for (const g of draftGroups) {
    const b = el('div');
    b.className = 'group';
    const label = el('label', 'Group name');
    const name = el('input');
    name.value = g.name;
    name.maxLength = 64;
    name.addEventListener('input', () => {
      g.name = name.value;
      dirty = true;
    });
    label.append(name);
    b.append(
      label,
      checkbox('Enable group', g.enabled, (v) => (g.enabled = v)).label,
    );
    const available = new Map(targets().map((t) => [t.id, t.name]));
    for (const id of g.members)
      if (!available.has(id)) available.set(id, targetLabel(id));
    for (const [id, text] of available)
      b.append(
        checkbox(text, g.members.includes(id), (v) => {
          g.members = v
            ? [...g.members, id]
            : g.members.filter((m) => m !== id);
        }).label,
      );
    const remove = el('button', 'Remove group');
    remove.className = 'secondary';
    remove.addEventListener('click', () => {
      draftGroups = draftGroups.filter((x) => x.id !== g.id);
      dirty = true;
      renderGroups();
    });
    b.append(remove);
    root.append(b);
  }
}
function setFields() {
  for (const [id, value] of Object.entries({
    adapter: config.adapter,
    host: config.openrgb.host,
    'rgb-port': config.openrgb.port,
    'hap-port': config.homekit.port,
    'bridge-name': config.homekit.name,
    logging: config.logging,
  }))
    $(id).value = value;
  $('zones-consent').checked = config.experimentalZones;
}
function renderLights(lights) {
  const root = $('lights');
  root.replaceChildren();
  for (const light of lights) {
    const b = el('div');
    b.className = 'light';
    b.append(
      el('h3', light.name),
      el(
        'p',
        light.available ? 'Available (desired software state)' : 'Unavailable',
      ),
    );
    const send = (state) => sendLightState(light.id, state);
    const on = checkbox(
      'On',
      light.state?.on ?? false,
      (v) => send({ on: v }),
      false,
    );
    on.input.disabled = !light.available;
    b.append(on.label);
    for (const [key, label, max] of [
      ['hue', 'Hue', 360],
      ['saturation', 'Saturation', 100],
      ['brightness', 'Brightness', 100],
    ]) {
      const l = el('label', label);
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(max);
      input.value = String(light.state?.[key] ?? 0);
      input.disabled = !light.available;
      input.addEventListener('input', () =>
        send({ [key]: Number(input.value) }),
      );
      l.append(input);
      b.append(l);
    }
    root.append(b);
  }
}
async function refresh(initial = false) {
  const s = await api('status');
  if (initial || !config) {
    revision = s.revision;
    config = s.config;
    draftDevices = structuredClone(config.devices);
    draftGroups = structuredClone(config.groups);
    setFields();
    renderDevices();
    $('autostart').checked = s.autostart;
  }
  const dashboard = $('dashboard');
  dashboard.replaceChildren();
  for (const [label, value] of [
    ['Bridge', s.running ? 'Running' : 'Stopped'],
    ['OpenRGB / adapter', s.connection],
    ['Detected devices', s.detectedDevices],
    ['Enabled lights', s.accessories],
  ]) {
    const card = el('div');
    card.className = 'stat';
    card.append(el('span', label), el('strong', String(value)));
    dashboard.append(card);
  }
  $('version').textContent = 'v' + s.version;
  $('pair-status').textContent =
    s.paired === null
      ? 'Bridge stopped — pairing status unavailable.'
      : s.paired
        ? 'Paired with Apple Home.'
        : 'Not paired yet.';
  $('data-path').textContent =
    'Private data folder: ' + s.dataDirectory + ' · Backups: ' + s.backups;
  $('last-error').textContent =
    s.lastError ||
    (s.groupFailure
      ? 'Last partial lighting operation. Failed: ' +
        s.groupFailure.failed.map(targetLabel).join(', ') +
        '. Transport accepted: ' +
        s.groupFailure.accepted.map(targetLabel).join(', ')
      : '');
  $('autostart').disabled = s.platform !== 'win32';
  if (!document.activeElement?.matches('#lights input')) renderLights(s.lights);
}
for (const command of ['start', 'stop', 'restart'])
  $(command).addEventListener('click', () =>
    action(async () => {
      await api(command, {});
      message('Bridge ' + command + ' completed.');
      await refresh();
    }),
  );
$('quit').addEventListener('click', () =>
  action(async () => {
    await api('quit', {});
    message('Application stopped. You may close this page.');
    token = '';
    sessionStorage.removeItem('bridge-token');
  }),
);
$('discover').addEventListener('click', () =>
  action(async () => {
    inventory = (await api('devices', {})).devices;
    renderDevices();
    message(
      inventory.length +
        ' controllers discovered. Select lights, then confirm and save.',
    );
  }),
);
$('zones-consent').addEventListener('change', () => {
  config.experimentalZones = $('zones-consent').checked;
  dirty = true;
  renderDevices();
});
$('add-group').addEventListener('click', () => {
  draftGroups.push({
    id: 'group:' + crypto.randomUUID(),
    name: 'RGB Group',
    enabled: false,
    members: [],
  });
  dirty = true;
  renderGroups();
});
$('adapter').addEventListener('change', () => {
  dirty = true;
  message(
    'Saving a changed backend clears existing selections. Discover its devices after saving.',
  );
});
$('save').addEventListener('click', () =>
  action(async () => {
    if (!$('save-confirm').checked)
      throw Error('Check the save confirmation first.');
    const next = structuredClone(config),
      changed = next.adapter !== $('adapter').value;
    next.adapter = $('adapter').value;
    next.openrgb.host = $('host').value;
    next.openrgb.port = Number($('rgb-port').value);
    next.homekit.name = $('bridge-name').value;
    next.homekit.port = Number($('hap-port').value);
    next.logging = $('logging').value;
    next.experimentalZones = $('zones-consent').checked;
    next.devices = changed ? [] : draftDevices;
    next.groups = changed ? [] : draftGroups;
    await api('config', { config: next, revision, confirm: true });
    config = undefined;
    dirty = false;
    $('save-confirm').checked = false;
    await refresh(true);
    message(
      'Configuration backed up and saved. Existing pairing identity retained.',
    );
  }),
);
$('autostart').addEventListener('change', () =>
  action(async () => {
    try {
      await api('autostart', { enabled: $('autostart').checked });
      message('Windows startup setting updated.');
    } catch (e) {
      $('autostart').checked = !$('autostart').checked;
      throw e;
    }
  }),
);
function hidePairing() {
  $('pairing').hidden = true;
  $('pin').textContent = '';
  $('qr').removeAttribute('src');
}
$('show-pairing').addEventListener('click', () =>
  action(async () => {
    const p = await api('pairing', {});
    $('pin').textContent = p.pincode;
    $('qr').src = p.qr;
    $('pairing').hidden = false;
  }),
);
$('hide-pairing').addEventListener('click', hidePairing);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hidePairing();
});
$('reset').addEventListener('click', () =>
  action(async () => {
    await api('reset', { confirmation: $('reset-confirm').value });
    hidePairing();
    $('reset-confirm').value = '';
    message(
      'Private backup created and pairing reset. Quit the application, then reopen its launcher.',
    );
    await refresh();
  }),
);
$('refresh-logs').addEventListener('click', () =>
  action(async () => {
    $('logs').textContent =
      (await api('logs')).events
        .map((e) => e.time + ' ' + e.level + ' ' + e.event)
        .join('\n') || 'No events recorded.';
  }),
);
window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
action(() => refresh(true));
setInterval(() => {
  if (token) action(() => refresh());
}, 3000);

for (const id of ['host', 'rgb-port', 'hap-port', 'bridge-name', 'logging'])
  $(id).addEventListener('input', () => {
    dirty = true;
  });
