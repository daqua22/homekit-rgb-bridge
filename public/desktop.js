/* Local-only UI. Dynamic data is rendered through textContent and form values. */
const byId = (id) => document.getElementById(id);
let token =
  new URLSearchParams(location.hash.slice(1)).get('token') ||
  sessionStorage.getItem('bridge-token');
if (token) {
  sessionStorage.setItem('bridge-token', token);
  history.replaceState(null, '', location.pathname);
}
let status,
  desktopInfo,
  inventory = [],
  draftDevices = [],
  draftGroups = [],
  initialized = false,
  selectionDirty = false;
let busy = false;
const pending = new Map();
function notify(text, error = false) {
  byId('notice').textContent = text;
  byId('notice').classList.toggle('error', error);
  byId('notice').hidden = !text;
}
function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
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
  const value = await response.json();
  if (!response.ok)
    throw Error(value.error || 'The action could not be completed.');
  return value;
}
async function native(method, value) {
  if (!window.desktop)
    throw Error('Open the installed desktop application to use this setting.');
  const response = await window.desktop[method](value);
  if (!response.ok) throw Error(response.error);
  return response.value;
}
let actionQueue = Promise.resolve();
function action(fn) {
  const run = async () => {
    busy = true;
    document.body.setAttribute('aria-busy', 'true');
    try {
      await fn();
    } catch (error) {
      notify(error.message, true);
    } finally {
      busy = false;
      document.body.removeAttribute('aria-busy');
    }
  };
  actionQueue = actionQueue.then(run, run);
  return actionQueue;
}

function hidePairing() {
  byId('private-pairing').hidden = true;
  byId('desktop-qr').removeAttribute('src');
  byId('desktop-pin').textContent = '';
  byId('hide-code').hidden = true;
}
function navigate(view) {
  hidePairing();
  for (const n of document.querySelectorAll('.view'))
    n.hidden = n.id !== 'view-' + view;
  for (const n of document.querySelectorAll('[data-view]')) {
    n.classList.toggle('active', n.dataset.view === view);
    if (n.dataset.view === view) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
  }
  const captions = {
    overview: 'Bridge status and light controls',
    devices: 'Select the devices to expose to Apple Home',
    home: 'HomeKit pairing',
    settings: 'Application preferences',
  };
  byId('page-caption').textContent = captions[view];
  window.scrollTo(0, 0);
}
for (const n of document.querySelectorAll('[data-view], [data-go]'))
  n.addEventListener('click', () => navigate(n.dataset.view || n.dataset.go));
document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  navigate('overview');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hidePairing();
});
window.addEventListener('blur', hidePairing);
function switchConfirmation(mock) {
  const dialog = byId('backend-dialog');
  byId('backend-dialog-title').textContent = mock
    ? 'Use a virtual demo light?'
    : 'Switch to real hardware?';
  byId('backend-dialog-detail').textContent =
    'This creates a private backup and replaces the selected lights and groups. Your HomeKit pairing identity is retained. Removed lights may need their rooms or automations reassigned in Apple Home.';
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => resolve(dialog.returnValue === 'confirm'),
      { once: true },
    );
    dialog.showModal();
  });
}
async function saveConfig(config) {
  await api('config', { config, revision: status.revision, confirm: true });
  initialized = false;
  selectionDirty = false;
  await refresh();
}
async function switchBackend(mock) {
  if (!(await switchConfirmation(mock))) return false;
  const config = structuredClone(status.config);
  config.adapter = mock ? 'mock' : 'openrgb';
  config.devices = mock
    ? [{ id: 'mock:virtual-light', name: 'Virtual RGB Light', enabled: true }]
    : [];
  config.groups = [];
  inventory = [];
  await saveConfig(config);
  return true;
}
async function discover() {
  if (status.config.adapter === 'mock' && !(await switchBackend(false))) return;
  byId('discovery-status').textContent = 'Connecting to OpenRGB…';
  if (desktopInfo?.launchOpenRGB) {
    const startup = await native('ensureOpenRGB');
    if (!startup.ready) throw Error(startup.message);
  }
  try {
    inventory = (await api('devices', {})).devices;
    renderDevices();
    renderGroups();
    await refresh();
    const message = inventory.length
      ? inventory.length +
        ' real controller' +
        (inventory.length === 1 ? '' : 's') +
        ' found. Select your lights below.'
      : 'OpenRGB connected, but no controllers were found. Check whether the devices appear inside OpenRGB itself.';
    byId('discovery-status').textContent = message;
    notify(message);
    navigate('devices');
  } catch (error) {
    inventory = [];
    renderDevices();
    byId('discovery-status').textContent =
      'OpenRGB is not ready yet. Start its SDK Server and try again.';
    navigate('devices');
    throw error;
  }
}
for (const id of ['setup-connect', 'discover-devices', 'use-hardware'])
  byId(id).addEventListener('click', () => action(discover));
function checkbox(text, checked, change, disabled = false) {
  const label = node('label'),
    input = node('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener('change', () => change(input.checked));
  label.append(input, node('span', text));
  return { label, input };
}
function selectDevice(id, name, enabled) {
  let device = draftDevices.find((x) => x.id === id);
  if (!device) {
    device = { id, name, enabled };
    draftDevices.push(device);
  }
  device.enabled = enabled;
  if (enabled) {
    const parent = inventory.find(
      (d) => d.id === id || d.zones.some((z) => z.id === id),
    );
    if (parent)
      for (const other of draftDevices) {
        if (
          other.id !== id &&
          (id === parent.id
            ? other.id.startsWith(parent.id + ':zone:')
            : other.id === parent.id)
        )
          other.enabled = false;
      }
  }
  selectionDirty = true;
  renderDevices();
}
function renderDevices() {
  const root = byId('device-list');
  root.replaceChildren();
  byId('device-count').textContent = inventory.length + ' found';
  byId('nav-count').textContent = String(inventory.length);
  byId('device-empty').hidden = inventory.length > 0;
  function target(id, name, supported = true, reason = '') {
    const draft = draftDevices.find((x) => x.id === id);
    const div = node('div', undefined, 'device-row');
    const header = checkbox(
      name,
      draft?.enabled ?? false,
      (value) => selectDevice(id, name, value),
      !supported,
    );
    header.label.className = 'device-header';
    div.append(header.label);
    if (reason) div.append(node('p', reason, 'footnote'));
    if (draft?.enabled) {
      const label = node('label', 'Name in Apple Home', 'device-name'),
        input = node('input');
      input.value = draft.name;
      input.maxLength = 64;
      input.addEventListener('input', () => {
        draft.name = input.value;
        selectionDirty = true;
      });
      label.append(input);
      div.append(label);
    }
    return div;
  }
  for (const d of inventory) {
    const row = target(
      d.id,
      d.name,
      d.capabilities.color,
      d.manufacturer +
        ' · ' +
        d.zones.reduce((total, zone) => total + zone.ledCount, 0) +
        ' LEDs · ' +
        (d.capabilities.reason || 'Whole-device color control'),
    );
    if (byId('enable-zones').checked)
      for (const zone of d.zones) {
        const z = node('div', undefined, 'zone-row');
        if (zone.id)
          z.append(
            target(
              zone.id,
              d.name + ' / ' + zone.name,
              zone.controllable,
              zone.reason || zone.ledCount + ' LEDs',
            ),
          );
        else
          z.append(
            node('p', zone.name + ' · ' + (zone.reason || 'Unavailable')),
          );
        row.append(z);
      }
    root.append(row);
  }
  const known = new Set(
    inventory.flatMap((d) => [d.id, ...d.zones.map((z) => z.id)]),
  );
  for (const d of draftDevices.filter((d) => d.enabled && !known.has(d.id)))
    root.append(
      target(
        d.id,
        d.name,
        true,
        'Saved selection · reconnect to verify this device.',
      ),
    );
}
function renderGroups() {
  const root = byId('group-list');
  root.replaceChildren();
  for (const group of draftGroups) {
    const card = node('div', undefined, 'group-card');
    card.append(
      checkbox('Expose this group as one light', group.enabled, (value) => {
        group.enabled = value;
        selectionDirty = true;
      }).label,
    );
    const label = node('label', 'Group name'),
      input = node('input');
    input.value = group.name;
    input.maxLength = 64;
    label.append(input);
    input.addEventListener('input', () => {
      group.name = input.value;
      selectionDirty = true;
    });
    card.append(label);
    const choices = inventory.flatMap((d) => [
      { id: d.id, name: d.name },
      ...(byId('enable-zones').checked
        ? d.zones
            .filter((z) => z.id && z.controllable)
            .map((z) => ({ id: z.id, name: d.name + ' / ' + z.name }))
        : []),
    ]);
    for (const id of group.members)
      if (!choices.some((x) => x.id === id))
        choices.push({
          id,
          name: draftDevices.find((d) => d.id === id)?.name || id,
        });
    for (const choice of choices)
      card.append(
        checkbox(choice.name, group.members.includes(choice.id), (value) => {
          group.members = value
            ? [...group.members, choice.id]
            : group.members.filter((id) => id !== choice.id);
          selectionDirty = true;
        }).label,
      );
    const remove = node('button', 'Remove group', 'secondary');
    remove.addEventListener('click', () => {
      draftGroups = draftGroups.filter((g) => g !== group);
      selectionDirty = true;
      renderGroups();
    });
    card.append(remove);
    root.append(card);
  }
}
byId('enable-zones').addEventListener('change', () => {
  selectionDirty = true;
  renderDevices();
  renderGroups();
});
byId('add-desktop-group').addEventListener('click', () => {
  draftGroups.push({
    id: 'group:' + crypto.randomUUID(),
    name: 'My RGB group',
    enabled: false,
    members: [],
  });
  selectionDirty = true;
  renderGroups();
});
byId('save-lights').addEventListener('click', () =>
  action(async () => {
    if (!byId('selection-confirm').checked)
      throw Error('Confirm your light selections before saving.');
    if (
      !draftDevices.some((d) => d.enabled) &&
      !draftGroups.some((g) => g.enabled)
    )
      throw Error('Select at least one device or group first.');
    const config = structuredClone(status.config);
    config.devices = draftDevices;
    config.groups = draftGroups;
    config.experimentalZones = byId('enable-zones').checked;
    await saveConfig(config);
    byId('selection-confirm').checked = false;
    await api('start', {});
    await refresh();
    navigate('overview');
    notify(
      'Your lights are saved and the bridge is running. Next: add it to Apple Home.',
    );
  }),
);
function queueLight(id, state) {
  let write = pending.get(id);
  if (!write) {
    write = { state: {}, timer: undefined };
    pending.set(id, write);
  }
  Object.assign(write.state, state);
  clearTimeout(write.timer);
  write.timer = setTimeout(() => {
    pending.delete(id);
    void api('light', { id, state: write.state }).catch((error) =>
      notify(error.message, true),
    );
  }, 60);
}
function renderLights() {
  if (document.activeElement?.closest('#lights-grid')) return;
  const root = byId('lights-grid');
  root.replaceChildren();
  byId('no-lights').hidden = status.lights.length > 0;
  const presets = [
    ['red', 'Red', { hue: 0, saturation: 100 }],
    ['green', 'Green', { hue: 140, saturation: 100 }],
    ['blue', 'Blue', { hue: 220, saturation: 100 }],
    ['purple', 'Purple', { hue: 280, saturation: 100 }],
    ['white', 'White', { hue: 0, saturation: 0 }],
  ];
  for (const light of status.lights) {
    const card = node('article', undefined, 'light-card'),
      header = node('div', undefined, 'light-top'),
      title = node('div');
    title.append(
      node('h3', light.name),
      node(
        'p',
        light.available ? 'Connected' : 'Waiting for device',
        'availability' + (light.available ? '' : ' offline'),
      ),
    );
    const power = checkbox(
      'On',
      light.state?.on ?? false,
      (value) => queueLight(light.id, { on: value }),
      !light.available,
    );
    header.append(title, power.label);
    card.append(header);
    const colors = node('div', undefined, 'color-presets');
    for (const [cls, name, state] of presets) {
      const button = node('button', undefined, 'swatch ' + cls);
      button.setAttribute('aria-label', light.name + ': ' + name);
      button.title = name;
      button.disabled = !light.available;
      button.addEventListener('click', () =>
        queueLight(light.id, { ...state, on: true }),
      );
      colors.append(button);
    }
    card.append(colors);
    for (const [key, text, max] of [
      ['brightness', 'Brightness', 100],
      ['hue', 'Hue', 360],
      ['saturation', 'Saturation', 100],
    ]) {
      const label = node('label', text),
        input = node('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(max);
      input.value = String(light.state?.[key] ?? 0);
      input.disabled = !light.available;
      input.setAttribute('aria-label', light.name + ': ' + text);
      input.addEventListener('input', () =>
        queueLight(light.id, { [key]: Number(input.value) }),
      );
      label.append(input);
      card.append(label);
    }
    root.append(card);
  }
}
async function refresh() {
  status = await api('status');
  if (!initialized) {
    draftDevices = structuredClone(status.config.devices);
    draftGroups = structuredClone(status.config.groups);
    byId('enable-zones').checked = status.config.experimentalZones;
    for (const [id, value] of Object.entries({
      'desktop-host': status.config.openrgb.host,
      'desktop-rgb-port': status.config.openrgb.port,
      'desktop-bridge-name': status.config.homekit.name,
      'desktop-hap-port': status.config.homekit.port,
    }))
      byId(id).value = value;
    initialized = true;
    renderDevices();
    renderGroups();
  }
  byId('app-version').textContent = 'v' + status.version + ' · Experimental';
  byId('demo-banner').hidden = status.config.adapter !== 'mock';
  const badge = byId('backend-badge');
  badge.textContent =
    status.config.adapter === 'mock'
      ? 'Virtual demo mode'
      : 'OpenRGB · real hardware';
  badge.className =
    'badge ' + (status.config.adapter === 'mock' ? 'demo' : 'real');
  const running = status.running;
  byId('bridge-status').textContent = running
    ? 'Bridge running'
    : 'Bridge stopped';
  byId('bridge-status').className = 'status-pill' + (running ? ' running' : '');
  const connected = status.connection === 'connected';
  byId('connection-status').textContent =
    status.config.adapter === 'mock'
      ? 'Virtual demo'
      : connected
        ? 'OpenRGB connected'
        : 'Waiting for OpenRGB';
  byId('connection-detail').textContent =
    status.config.adapter === 'mock'
      ? 'Switch to real hardware to find your devices.'
      : connected
        ? 'SDK connected on your PC.'
        : 'Start the SDK Server, then connect.';
  byId('light-count').textContent = String(status.accessories);
  const pairing = !running
    ? 'Not running'
    : status.paired
      ? 'Paired'
      : 'Ready to pair';
  byId('pair-status').textContent = pairing;
  byId('home-pair-badge').textContent = pairing;
  byId('pair-detail').textContent = status.paired
    ? 'Look for your lights in their assigned rooms.'
    : 'Reveal your private code in Apple Home setup.';
  byId('start-bridge').disabled = running || status.accessories === 0;
  byId('stop-bridge').disabled = !running;
  byId('reveal-code').disabled = !running || status.accessories === 0;
  byId('home-heading').textContent = status.paired
    ? 'Your bridge is paired'
    : 'Add your selected lights';
  byId('home-instructions').textContent =
    status.accessories === 0
      ? 'Choose at least one light in RGB devices, save, then start the bridge.'
      : !running
        ? 'Start the bridge from Overview to make your selected lights available.'
        : status.paired
          ? 'Your lights are available through this bridge. Existing pairing is preserved; you do not need to add it again.'
          : 'Your selected lights are ready. Reveal the code below when you’re ready to pair.';
  const steps = [connected, status.accessories > 0, status.paired === true];
  ['step-connect', 'step-select', 'step-pair'].forEach((id, i) =>
    byId(id).classList.toggle('complete', steps[i]),
  );
  byId('setup-progress').textContent = steps.filter(Boolean).length + ' of 3';
  byId('finish-setup').disabled = !running || !status.accessories;
  byId('setup-card').hidden = desktopInfo?.setupComplete ?? false;
  byId('desktop-profile').textContent = status.dataDirectory;
  byId('diagnostic-summary').textContent =
    status.lastError ||
    'Backend: ' +
      status.config.adapter +
      ' · Connection: ' +
      status.connection +
      ' · Selected lights: ' +
      status.accessories;
  renderLights();
}
async function refreshDesktop() {
  if (!window.desktop) return;
  const firstLoad = !desktopInfo;
  desktopInfo = await native('info');
  byId('profile-banner').hidden =
    desktopInfo.setupComplete ||
    !desktopInfo.profiles.some(
      (profile) => profile.path !== desktopInfo.profile,
    );
  byId('desktop-autostart').checked = desktopInfo.autostart;
  const canAutostart = desktopInfo.platform === 'win32' && desktopInfo.packaged;
  byId('desktop-autostart').disabled = !canAutostart;
  byId('setup-startup').disabled = !canAutostart;
  byId('setup-openrgb').disabled =
    desktopInfo.platform !== 'win32' || desktopInfo.openRGBAdministrator;
  if (firstLoad) {
    byId('setup-startup').checked = canAutostart;
    byId('setup-openrgb').checked =
      desktopInfo.platform === 'win32' &&
      (!desktopInfo.setupComplete || desktopInfo.launchOpenRGB);
  }
  byId('startup-note').textContent = desktopInfo.legacyStartup
    ? 'A legacy startup launcher exists. Enable this setting to replace this profile’s old launcher with the desktop app.'
    : canAutostart
      ? 'Starts quietly in the tray after you sign in. The PC must stay awake for Home control.'
      : 'Startup is available in the installed Windows build.';
  byId('launch-openrgb').checked = desktopInfo.launchOpenRGB;
  byId('launch-openrgb').disabled =
    desktopInfo.platform !== 'win32' || desktopInfo.openRGBAdministrator;
  byId('configure-windows-startup').disabled = !canAutostart;
  byId('disable-windows-startup').disabled = !canAutostart;
  byId('openrgb-path').textContent =
    desktopInfo.openRGBPath ||
    'Choose your installed OpenRGB.exe to start it with the bridge.';
  const others = desktopInfo.profiles.filter(
    (p) => p.path !== desktopInfo.profile,
  );
  byId('existing-profiles').textContent = others.length
    ? others.length +
      ' other profile' +
      (others.length === 1 ? '' : 's') +
      ' detected. Choose one below to reuse its saved lights and HomeKit data.'
    : 'No other profiles found in known locations. Search again or browse if your old profile was stored elsewhere.';
  await refreshStartup();
}
for (const [id, command] of [
  ['start-bridge', 'start'],
  ['stop-bridge', 'stop'],
])
  byId(id).addEventListener('click', () =>
    action(async () => {
      hidePairing();
      await api(command, {});
      await refresh();
      notify(
        command === 'start'
          ? 'Bridge started. Your selected lights are available to Apple Home.'
          : 'Bridge stopped.',
      );
    }),
  );
byId('reveal-code').addEventListener('click', () =>
  action(async () => {
    const pairing = await api('pairing', {});
    byId('desktop-pin').textContent = pairing.pincode;
    byId('desktop-qr').src = pairing.qr;
    byId('private-pairing').hidden = false;
    byId('hide-code').hidden = false;
  }),
);
byId('hide-code').addEventListener('click', hidePairing);
byId('save-desktop-settings').addEventListener('click', () =>
  action(async () => {
    if (!byId('settings-confirm').checked)
      throw Error('Confirm the settings changes before saving.');
    if (selectionDirty)
      throw Error(
        'Save your light selections first, or reopen this page to discard them.',
      );
    const config = structuredClone(status.config);
    config.openrgb.host = byId('desktop-host').value;
    config.openrgb.port = Number(byId('desktop-rgb-port').value);
    config.homekit.name = byId('desktop-bridge-name').value;
    config.homekit.port = Number(byId('desktop-hap-port').value);
    if (
      config.openrgb.host !== status.config.openrgb.host ||
      config.openrgb.port !== status.config.openrgb.port
    )
      inventory = [];
    await saveConfig(config);
    if (window.desktop)
      await refreshStartup(await native('checkPrerequisites'));
    byId('settings-confirm').checked = false;
    notify(
      'Connection settings saved. A private backup was created and pairing was retained.',
    );
  }),
);
byId('desktop-autostart').addEventListener('change', () => {
  const enabled = byId('desktop-autostart').checked;
  return action(async () => {
    try {
      await api('autostart', { enabled });
      await refreshDesktop();
      notify('Windows startup preference saved.');
    } catch (e) {
      await refreshDesktop();
      throw e;
    }
  });
});
byId('launch-openrgb').addEventListener('change', () => {
  const desired = byId('launch-openrgb').checked;
  return action(async () => {
    try {
      if (desired && !desktopInfo?.openRGBPath) {
        await native('chooseOpenRGB');
        await refreshDesktop();
      }
      await native('preferences', { launchOpenRGB: desired });
      await refreshDesktop();
      if (desired) await native('startOpenRGB');
      notify('OpenRGB startup preference saved.');
    } catch (error) {
      await refreshDesktop();
      throw error;
    }
  });
});
for (const [id, enabled] of [
  ['configure-windows-startup', true],
  ['disable-windows-startup', false],
])
  byId(id).addEventListener('click', () =>
    action(async () => {
      if (enabled && !desktopInfo?.openRGBPath) {
        await native('chooseOpenRGB');
        await refreshDesktop();
      }
      await native('configureStartup', enabled);
      await refreshDesktop();
      byId('setup-startup').checked = enabled;
      if (enabled) byId('setup-openrgb').checked = true;
      notify(
        enabled
          ? 'Automatic Windows startup is configured for your next sign-in.'
          : 'Automatic Windows startup is disabled.',
      );
    }),
  );
async function refreshStartup(value) {
  if (!window.desktop) return;
  const info = value || (await native('startupStatus'));
  const text = info.configuringStartup
    ? 'Approve the one-time Windows startup setup, if prompted…'
    : info.phase === 'idle'
      ? info.sdkAvailable
        ? 'The SDK Server port is available.'
        : 'OpenRGB is not connected. Enable automatic startup or choose Open now.'
      : info.message;
  const statusLine = byId('openrgb-startup-status');
  if (statusLine.textContent !== text) statusLine.textContent = text;
  statusLine.dataset.phase = info.configuringStartup ? 'checking' : info.phase;
  byId('configure-windows-startup').textContent =
    info.taskStatus === 'needs-update'
      ? 'Update automatic Windows startup'
      : 'Set up automatic Windows startup';
  const tasks = {
    configured: 'configured for sign-in, without a prompt each boot.',
    'needs-update': 'update setup after changing the OpenRGB path or port.',
    missing: 'not configured.',
    foreign: 'an unrelated task uses this name; it was not changed.',
    unknown: 'could not verify the Windows task.',
  };
  byId('managed-startup-status').textContent =
    'Automatic RAM startup: ' + (tasks[info.taskStatus] || tasks.unknown);
  const drivers = {
    installed:
      'PawnIO driver: installed. No separate PawnIO app needs to stay open.',
    missing:
      'PawnIO driver: not detected. Install it once if your hardware requires it.',
    unknown:
      'PawnIO driver: could not check. Choose Check required apps to try again.',
    'not-windows': 'PawnIO driver: Windows only.',
  };
  byId('pawnio-status').textContent = drivers[info.pawnio] || drivers.unknown;
}
byId('check-prerequisites').addEventListener('click', () =>
  action(async () => {
    await refreshStartup(await native('checkPrerequisites'));
    notify('Required-app checks complete. See the status in Settings.');
  }),
);
byId('choose-openrgb').addEventListener('click', () =>
  action(async () => {
    await native('chooseOpenRGB');
    await refreshDesktop();
    await refreshStartup(await native('checkPrerequisites'));
  }),
);
function profileError(error) {
  byId('profile-search-error').textContent = error.message;
  byId('profile-search-error').hidden = false;
}
function renderProfileChoices() {
  const root = byId('profile-choices');
  root.replaceChildren();
  byId('profile-search-error').hidden = true;
  byId('profile-search-empty').hidden = desktopInfo.profiles.some(
    (p) => p.path !== desktopInfo.profile,
  );
  byId('profile-search-note').textContent =
    'Checks your usual bridge folders and saved startup locations. Browse if you stored your profile elsewhere.';
  const choices = [...desktopInfo.profiles].sort(
    (a, b) =>
      Number(a.path === desktopInfo.profile) -
      Number(b.path === desktopInfo.profile),
  );
  for (const profile of choices) {
    const current = profile.path === desktopInfo.profile;
    const row = node('article', undefined, 'profile-choice');
    row.append(node('h3', profile.name + (current ? ' (current)' : '')));
    row.append(node('p', profile.path, 'path-text'));
    if (profile.adapter)
      row.append(
        node(
          'p',
          profile.bridgeName +
            ' · ' +
            (profile.adapter === 'openrgb'
              ? 'OpenRGB hardware'
              : 'Virtual demo') +
            ' · ' +
            profile.lights +
            ' selected light' +
            (profile.lights === 1 ? '' : 's'),
        ),
      );
    row.append(
      node(
        'p',
        profile.problem ||
          (profile.hasHomeKitData
            ? 'Saved HomeKit data and identity found.'
            : profile.hasIdentity
              ? 'Bridge identity found. No saved HomeKit storage detected.'
              : 'Configuration found. No saved HomeKit identity or pairing data detected.'),
      ),
    );
    const use = node(
      'button',
      current ? 'Current profile' : 'Use profile & restart',
    );
    use.type = 'button';
    use.disabled = current || !profile.available;
    use.addEventListener('click', () =>
      action(async () => {
        try {
          await native('chooseProfile', profile.path);
        } catch (error) {
          profileError(error);
        }
      }),
    );
    row.append(use);
    root.append(row);
  }
}
async function openProfilePicker() {
  hidePairing();
  await refreshDesktop();
  renderProfileChoices();
  byId('profile-dialog').showModal();
}
for (const id of ['open-previous-profile', 'choose-profile'])
  byId(id).addEventListener('click', () => action(openProfilePicker));
byId('rescan-profiles').addEventListener('click', () =>
  action(async () => {
    try {
      await refreshDesktop();
      renderProfileChoices();
    } catch (error) {
      profileError(error);
    }
  }),
);
byId('browse-profile').addEventListener('click', () =>
  action(async () => {
    try {
      await native('chooseProfile');
    } catch (error) {
      profileError(error);
    }
  }),
);
for (const id of ['launch-openrgb-now', 'launch-rgb-devices'])
  byId(id).addEventListener('click', () =>
    action(async () => {
      const result = await native('startOpenRGB');
      if (result) notify(result.message);
    }),
  );
for (const button of document.querySelectorAll('[data-help]'))
  button.addEventListener('click', () =>
    action(() => native('openHelp', button.dataset.help)),
  );
byId('finish-setup').addEventListener('click', () =>
  action(async () => {
    const launchOpenRGB = byId('setup-openrgb').checked;
    if (launchOpenRGB && !desktopInfo?.openRGBPath) {
      await native('chooseOpenRGB');
      await refreshDesktop();
      if (!desktopInfo?.openRGBPath)
        throw Error(
          'Choose OpenRGB.exe, or uncheck automatic OpenRGB startup to finish.',
        );
    }
    if (desktopInfo?.platform === 'win32' && desktopInfo.packaged)
      await api('autostart', { enabled: byId('setup-startup').checked });
    await native('preferences', { launchOpenRGB, setupComplete: true });
    if (launchOpenRGB) await native('startOpenRGB');
    await refreshDesktop();
    await refresh();
    notify(
      'You’re all set. Closing this window keeps the bridge running in the tray.',
    );
  }),
);
byId('refresh-desktop-logs').addEventListener('click', () =>
  action(async () => {
    const logs = await api('logs');
    byId('desktop-logs').textContent = logs.events
      .map((event) => JSON.stringify(event))
      .join('\n');
  }),
);
byId('demo-mode').addEventListener('click', () =>
  action(async () => {
    if (!(await switchBackend(true))) return;
    inventory = (await api('devices', {})).devices;
    renderDevices();
    renderGroups();
    await api('start', {});
    await refresh();
    navigate('overview');
    notify('Virtual demo enabled. This does not control real hardware.');
  }),
);
byId('desktop-reset').addEventListener('click', () =>
  action(async () => {
    await api('reset', { confirmation: byId('desktop-reset-confirm').value });
    hidePairing();
    await refresh();
    notify(
      'Pairing reset was backed up. Quit and reopen the app before pairing again.',
    );
  }),
);
byId('quit-desktop').addEventListener('click', () =>
  action(async () => {
    hidePairing();
    await api('quit', {});
    sessionStorage.removeItem('bridge-token');
    token = '';
    notify('Application stopped.');
  }),
);
void action(async () => {
  await refreshDesktop();
  await refresh();
  if (!desktopInfo)
    for (const id of [
      'desktop-autostart',
      'setup-startup',
      'launch-openrgb',
      'setup-openrgb',
      'configure-windows-startup',
      'disable-windows-startup',
      'check-prerequisites',
      'choose-openrgb',
      'choose-profile',
      'finish-setup',
    ])
      byId(id).disabled = true;
  if (status.config.adapter === 'openrgb') {
    try {
      inventory = (await api('devices', {})).devices;
      renderDevices();
      renderGroups();
      await refresh();
    } catch {
      byId('discovery-status').textContent =
        'Waiting for OpenRGB. Start its SDK Server, then connect.';
    }
  }
});
setInterval(() => {
  void refreshStartup().catch(() => {});
  if (!busy)
    void refresh().catch(() =>
      notify(
        'Connection to the local bridge was interrupted. Reopen the application to reconnect.',
        true,
      ),
    );
}, 3000);
