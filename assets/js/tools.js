/* Project cards select a collection; a focused preview explains each command.
   The original static catalog is the source of truth and the no-JS fallback. */
(function () {
  'use strict';
  const library = document.querySelector('.tool-library');
  if (!library) return;
  const byId = id => document.getElementById(id);
  const search = byId('toolsSearch');
  const filters = [...library.querySelectorAll('[data-category]')];
  const groups = [...library.querySelectorAll('[data-group]')];
  const normalize = text => text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const titles = {
    PIPESIZING: 'Size the pipe. Check the flow.', PIPESLOPER: 'Set the slope for the run.',
    CHANGEELEVATION: 'Bring elevations into line.', INVERTPULLUP: 'Raise the inverts.',
    LOWRIM: 'Find the lowest rim.', COVERADJUST: 'Set the cover to the surface.',
    EEEBEND: 'Work out the bypass.', PRESSCOUNT: 'Account for every part.', ELEVSLOPE: 'Control the elevation change.',
    PUMPCALCULATOR: 'Work through the pump station.', XYLEMSOLVER: 'Find a pump for the duty.',
    BULKSUR: 'Build the profiles in one pass.', PIPEMAGIC: 'Bring the network into view.',
    CHOPCHOP: 'Break the profile into sections.', OFFPV: 'Work with profile offsets.', PROFOFF: 'Work with profile offsets.',
    PVSTYLE: 'Give the profile a consistent style.', PVIFIX: 'Get the vertical bends moving.',
    PVIFIXDIAG: 'Inspect the profile connection.', RRNETWORKCHECK: 'Check what clears. Check what covers.', GETPARENT: 'Trace the profile to its alignment.',
    LLABELGEN: 'Give every crossing its context.', PIPEPVLABEL: 'Put elevations at the pipe ends.',
    MARKFITTINGS: 'Make the fittings visible.', MARKLINES: 'Mark where the lines cross.',
    VTPANEL: 'Put vehicle tools within reach.', VTSWEEP: 'See what makes the turn.', VTDRIVE: 'Take the vehicle through it.',
    VTEDIT: 'Refine the path.', VTPARK: 'Make room to park.',
    BLOCKTOSURFACE: 'Build terrain from block elevations.', TEXTTOSURFACE: 'Turn spot elevations into terrain.',
    SUR2MT: 'Bring surface elevations into the notes.', AREAMANAGER: 'Keep your takeoffs together.', EXF: 'Keep track of the excavation.',
    FLOODZONE: 'Locate the flood zone.', FLOODCRITERIA: 'Find the site’s flood criteria.', FOLIO: 'Start with the property.',
    GWMAY: 'Check May groundwater.', GWOCT: 'Check October groundwater.', SECTIONLOOKUP: 'Locate township, range, and section.',
    MDWASDSEWER: 'Bring in the sewer network.', MWASDWATER: 'Bring in the water mains.',
    LATERALBEAST: 'Find a feasible connection.', LATMANAGER: 'Keep lateral crossings organized.',
    SECDRAW: 'Draw the road in section.', TABLEDRAW: 'Keep the table connected to its data.', CAD: 'Dimension the cross section.',
    ALIGNDEPLOY: 'Repeat the alignment along the route.', STATIONMAKER: 'Connect the stations.', CORALASBUILT: 'Bring the as-built into the drawing.',
    VPCUT: 'Frame the drawing.', ALDTTOOLBAR: 'Keep the toolkit close.', ALDTHELP: 'Find help inside Civil 3D.', ALDTLICENSE: 'Check your access.'
  };
  const collections = new Map(groups.map(group => [group.dataset.group, {
    label: filters.find(button => button.dataset.category === group.dataset.group).querySelector('.discipline-card__bottom > span').textContent,
    commands: [...group.querySelectorAll('[data-command]')].map(row => ({
      code: row.dataset.command, description: row.querySelector('p').textContent,
      badge: !!row.querySelector('.command__badge'), category: group.dataset.group,
      title: titles[row.dataset.command] || row.dataset.command,
      searchText: normalize(`${row.textContent} ${titles[row.dataset.command] || ''}`)
    }))
  }]));
  const all = [...collections.values()].flatMap(group => group.commands);
  const featured = { networks: 'PUMPCALCULATOR', profiles: 'PIPEMAGIC', vehicles: 'VTSWEEP', surfaces: 'AREAMANAGER' };
  let category = filters[0].dataset.category;
  let current = featured[category];
  let matches = [];
  function refreshLayout() { window.ALDT?.ScrollTrigger?.refresh(); }
  function showCommand(code, animate = true) {
    const index = matches.findIndex(command => command.code === code);
    if (index < 0) return;
    const command = matches[index]; current = code;
    byId('toolsCommandTitle').textContent = command.title;
    byId('toolsDescription').textContent = command.description;
    byId('toolsCode').textContent = command.code;
    byId('toolsBadge').hidden = !command.badge;
    byId('toolsDiscipline').textContent = collections.get(command.category).label;
    byId('toolsPosition').textContent = `${String(index + 1).padStart(2, '0')} / ${String(matches.length).padStart(2, '0')}`;
    byId('toolsChoices').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.code === code)));
    byId('toolsPrevious').disabled = index === 0;
    byId('toolsNext').disabled = index === matches.length - 1;
    const spotlight = byId('toolsSpotlight');
    if (animate) { spotlight.classList.remove('is-changing'); void spotlight.offsetWidth; spotlight.classList.add('is-changing'); }
    refreshLayout();
  }
  function update(preferred) {
    const query = normalize(search.value.trim());
    const terms = query.split(/\s+/).filter(Boolean);
    matches = terms.length ? all.filter(command => terms.every(term => command.searchText.includes(term))) : collections.get(category).commands;
    filters.forEach(button => button.setAttribute('aria-pressed', String(!query && button.dataset.category === category)));
    byId('toolsResults').textContent = query ? `${matches.length} ${matches.length === 1 ? 'command' : 'commands'} matching “${search.value.trim()}”` : `${matches.length} commands · Choose one to explore`;
    byId('toolsClear').hidden = !search.value;
    byId('toolsEmpty').hidden = matches.length > 0;
    byId('toolsSpotlight').hidden = matches.length === 0;
    const choices = byId('toolsChoices');
    choices.replaceChildren();
    for (const command of matches) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'tool-choice'; button.dataset.code = command.code;
      button.textContent = command.code; button.setAttribute('aria-controls', 'toolsSpotlight');
      button.addEventListener('click', () => showCommand(command.code));
      choices.append(button);
    }
    choices.scrollTop = 0;
    if (matches.length) showCommand(matches.some(command => command.code === preferred) ? preferred : matches[0].code, false);
    else { byId('toolsDiscipline').textContent = 'Search the toolkit'; byId('toolsPosition').textContent = '00 / 00'; refreshLayout(); }
  }
  search.addEventListener('input', () => update(current));
  const resetSearch = () => { search.value = ''; update(featured[category]); search.focus({ preventScroll: true }); };
  byId('toolsClear').addEventListener('click', resetSearch);
  byId('toolsReset').addEventListener('click', resetSearch);
  filters.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.category; search.value = ''; update(featured[category]);
  }));
  for (const [id, direction] of [['toolsPrevious', -1], ['toolsNext', 1]]) {
    byId(id).addEventListener('click', () => {
      const next = matches[matches.findIndex(command => command.code === current) + direction];
      if (next) showCommand(next.code);
    });
  }
  document.querySelectorAll('[data-command-link]').forEach(link => link.addEventListener('click', () => {
    const command = all.find(item => item.code === link.dataset.commandLink);
    if (!command) return;
    category = command.category; search.value = ''; update(command.code);
  }));
  library.classList.add('is-enhanced');
  update(current);
})();
