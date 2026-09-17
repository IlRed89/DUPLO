/**
 * @file resultsView.js
 * @description Vista risultati di DUPLO: badge criteri, sezioni, righe file.
 *
 * Caricato dopo `renderer.js` così usa `state`, `dom`, `t`, `logToMain`,
 * `formatBytes`, `askRenameFile` e `askDeleteSingleFile` già definiti.
 * Nessun modulo Node: tutto passa da `window.duploAPI`.
 */
'use strict';

/**
 * Elenco criteri AND di un cluster (mai fallback silenzioso su `size`).
 *
 * @param {Object} group
 * @returns {string[]}
 */
function criteriaListOf(group) {
  if (group && Array.isArray(group.matchedCriteria) && group.matchedCriteria.length > 0) {
    return group.matchedCriteria.filter(function (key) {
      return MATCH_REASON_ORDER.indexOf(key) !== -1;
    });
  }
  const fallback = String((group && group.matchReason) || '');
  if (MATCH_REASON_ORDER.indexOf(fallback) !== -1) {
    return [fallback];
  }
  return [];
}

/**
 * Firma stabile per raggruppare i cluster con la stessa combinazione AND.
 *
 * @param {Object} group
 * @returns {string}
 */
function criteriaSignature(group) {
  return criteriaListOf(group).join('+') || 'unknown';
}

/**
 * Etichette localizzate unite da un separatore visivo discreto (punto medio).
 * Nessuna dicitura tecnica «AND»: la logica di intersezione resta nel motore.
 *
 * @param {string[]} list
 * @returns {string}
 */
function formatCriteriaLabels(list) {
  const names = (list || []).map(function (key) {
    const label = t('reason.' + key);
    return label === 'reason.' + key ? key : label;
  });
  const joiner = t('reason.andJoin');
  return names.join(joiner === 'reason.andJoin' ? ' • ' : joiner);
}

/**
 * Badge grafici per i criteri combinati applicati al cluster.
 * Ogni chiave (`size`, `name`, `hash`, …) diventa un chip tradotto.
 *
 * @param {string[]} list
 * @returns {HTMLElement}
 */
function buildCriteriaBadges(list) {
  const wrap = document.createElement('div');
  wrap.className = 'criteria-badges';
  const keys = Array.isArray(list) ? list : [];
  const names = [];
  keys.forEach(function (key) {
    const label = t('reason.' + key);
    const text = label === 'reason.' + key ? key : label;
    names.push(text);
    const badge = document.createElement('span');
    badge.className = 'criteria-badge';
    badge.textContent = text;
    wrap.appendChild(badge);
  });
  if (names.length === 0) {
    const badge = document.createElement('span');
    badge.className = 'criteria-badge';
    badge.textContent = t('reason.size');
    wrap.appendChild(badge);
    names.push(t('reason.size'));
  }
  wrap.title = formatCriteriaLabels(keys.length ? keys : ['size']);
  return wrap;
}

/**
 * Percorsi dei duplicati (escluso l'originale, indice 0) in gruppi.
 *
 * @param {Array<Object>} groups
 * @returns {string[]}
 */
function collectDuplicatePaths(groups) {
  const paths = [];
  (groups || []).forEach(function (group) {
    (group.files || []).forEach(function (file, idx) {
      if (idx === 0 || !file || !file.path) {
        return;
      }
      paths.push(file.path);
    });
  });
  return paths;
}

/**
 * True se ogni duplicato della lista è in `state.selectedPaths`.
 *
 * @param {string[]} paths
 * @returns {boolean}
 */
function areAllPathsSelected(paths) {
  if (!paths || paths.length === 0) {
    return false;
  }
  return paths.every(function (p) {
    return !!state.selectedPaths[p];
  });
}

/**
 * Toggle a due vie: se tutti i target sono selezionati li toglie, altrimenti li spunta tutti.
 *
 * @param {string[]} paths
 * @param {string} scope Etichetta di log (`section` / `group`).
 * @returns {void}
 */
function toggleDuplicateSelection(paths, scope) {
  const allOn = areAllPathsSelected(paths);
  if (allOn) {
    paths.forEach(function (p) {
      delete state.selectedPaths[p];
    });
    logToMain('info', 'Deselezionati ' + paths.length + ' duplicati (' + scope + ')');
  } else {
    paths.forEach(function (p) {
      state.selectedPaths[p] = true;
    });
    logToMain('info', 'Selezionati ' + paths.length + ' duplicati (' + scope + ')');
  }
  renderResults();
}

/**
 * Raggruppa i cluster per combinazione AND di criteri (non per un solo fallback).
 *
 * @param {Array<Object>} groups
 * @returns {Array<{ reason: string, criteria: string[], groups: Array<Object> }>}
 */
function groupResultsByMatchReason(groups) {
  const buckets = {};
  const order = [];
  (groups || []).forEach(function (group) {
    const criteria = criteriaListOf(group);
    const sig = criteria.join('+') || 'unknown';
    if (!buckets[sig]) {
      buckets[sig] = [];
      order.push(sig);
    }
    buckets[sig].push(group);
  });
  return order.map(function (sig) {
    const list = buckets[sig];
    return {
      reason: sig,
      criteria: criteriaListOf(list[0]),
      groups: list
    };
  });
}

/**
 * Costruisce una macro-sezione collassabile per una combinazione AND di criteri.
 *
 * @param {string} reason Firma (`size+extension+hash`).
 * @param {Array<Object>} groups
 * @param {string[]} [criteria]
 * @returns {HTMLElement}
 */
function buildReasonSection(reason, groups, criteria) {
  const section = document.createElement('section');
  const collapsed = !!state.collapsedReasons[reason];
  const list = Array.isArray(criteria) && criteria.length ? criteria : (reason ? reason.split('+') : []);
  const titleText = formatCriteriaLabels(list) || t('reason.size');
  section.className = 'reason-section' + (collapsed ? ' is-collapsed' : '');
  section.dataset.reason = reason;

  let fileCount = 0;
  groups.forEach(function (g) {
    fileCount += Array.isArray(g.files) ? g.files.length : 0;
  });

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'reason-section-header';
  header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  header.title = (collapsed ? t('reason.expand') : t('reason.collapse')) + ' — ' + titleText;

  const titleWrap = document.createElement('div');
  titleWrap.className = 'reason-section-title';
  titleWrap.appendChild(buildCriteriaBadges(list));

  const meta = document.createElement('div');
  meta.className = 'reason-section-meta';
  const count = document.createElement('span');
  count.className = 'reason-section-count';
  count.textContent = t('reason.counts', { groups: groups.length, files: fileCount });
  const chevron = document.createElement('span');
  chevron.className = 'reason-section-toggle';
  chevron.textContent = collapsed ? '▸' : '▾';
  meta.appendChild(count);
  meta.appendChild(chevron);

  header.appendChild(titleWrap);
  header.appendChild(meta);
  header.addEventListener('click', function () {
    state.collapsedReasons[reason] = !state.collapsedReasons[reason];
    logToMain('info', t('log.sectionToggle', {
      reason: reason,
      state: state.collapsedReasons[reason] ? t('log.sectionCollapsed') : t('log.sectionExpanded')
    }));
    renderResults();
  });

  const body = document.createElement('div');
  body.className = 'reason-section-body';

  const dupPaths = collectDuplicatePaths(groups);
  const allOn = areAllPathsSelected(dupPaths);
  const selectRow = document.createElement('label');
  selectRow.className = 'reason-section-select';
  const selectAll = document.createElement('input');
  selectAll.type = 'checkbox';
  selectAll.className = 'file-check';
  selectAll.checked = allOn;
  selectAll.title = allOn ? t('results.deselectDuplicates') : t('results.selectDuplicates');
  selectAll.addEventListener('click', function (event) {
    event.stopPropagation();
  });
  selectAll.addEventListener('change', function () {
    toggleDuplicateSelection(dupPaths, 'section:' + reason);
  });
  const selectLbl = document.createElement('span');
  selectLbl.textContent = allOn ? t('results.deselectDuplicates') : t('results.selectDuplicates');
  selectRow.appendChild(selectAll);
  selectRow.appendChild(selectLbl);
  body.appendChild(selectRow);

  groups.forEach(function (group, groupIdx) {
    body.appendChild(buildDuplicateCard(group, groupIdx));
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

/**
 * Disegna i gruppi duplicati sezionati per combinazione AND di criteri.
 * @returns {void}
 */
function renderResults() {
  if (dom.resultsList) {
    dom.resultsList.innerHTML = '';
  }
  if (state.duplicateGroups.length === 0) {
    if (dom.statsBanner) {
      dom.statsBanner.style.display = 'none';
    }
    if (dom.resultsToolbar) {
      dom.resultsToolbar.style.display = 'none';
    }
    if (dom.emptyPlaceholder) {
      dom.emptyPlaceholder.style.display = 'flex';
    }
    if (dom.emptyPlaceholderTitle) {
      dom.emptyPlaceholderTitle.textContent = t('results.emptyNoneFound');
    }
    if (dom.emptyPlaceholderText) {
      dom.emptyPlaceholderText.textContent = t('results.emptyText');
    }
    return;
  }

  let totalDuplicates = 0;
  let totalWastedBytes = 0;
  state.duplicateGroups.forEach(function (g) {
    totalDuplicates += (g.fileCount - 1);
    totalWastedBytes += g.wastedBytes;
  });

  if (dom.statFilesScanned) {
    dom.statFilesScanned.textContent = state.totalFilesScanned || '-';
  }
  if (dom.statGroupsCount) {
    dom.statGroupsCount.textContent = String(state.duplicateGroups.length);
  }
  if (dom.statDuplicatesCount) {
    dom.statDuplicatesCount.textContent = String(totalDuplicates);
  }
  if (dom.statWastedSpace) {
    dom.statWastedSpace.textContent = formatBytes(totalWastedBytes);
  }
  if (dom.statsBanner) {
    dom.statsBanner.style.display = 'grid';
  }
  if (dom.resultsToolbar) {
    dom.resultsToolbar.style.display = 'flex';
  }
  if (dom.emptyPlaceholder) {
    dom.emptyPlaceholder.style.display = 'none';
  }

  const sections = groupResultsByMatchReason(state.duplicateGroups);
  const host = dom.resultsList || dom.resultsScrollContainer;
  sections.forEach(function (section) {
    host.appendChild(buildReasonSection(section.reason, section.groups, section.criteria));
  });
}

/**
 * Card di un set identico (originale + duplicati) dentro una macro-sezione.
 *
 * @param {Object} group
 * @param {number} groupIdx
 * @returns {HTMLElement}
 */
function buildDuplicateCard(group, groupIdx) {
  const card = document.createElement('div');
  card.className = 'duplicate-group-card';
  const header = document.createElement('div');
  header.className = 'group-header';

  const info = document.createElement('div');
  info.className = 'group-info';
  const badge = document.createElement('span');
  badge.className = 'group-badge';
  badge.textContent = t('results.group', { n: group.groupId || (groupIdx + 1) });
  const each = document.createElement('span');
  each.textContent = t('results.each', { size: formatBytes(group.size) });
  info.appendChild(badge);
  info.appendChild(each);
  const applied = criteriaListOf(group);
  if (applied.length > 0) {
    info.appendChild(buildCriteriaBadges(applied));
  }

  const groupPaths = collectDuplicatePaths([group]);
  const groupAllOn = areAllPathsSelected(groupPaths);
  const groupSelect = document.createElement('label');
  groupSelect.className = 'reason-section-select';
  const groupCb = document.createElement('input');
  groupCb.type = 'checkbox';
  groupCb.className = 'file-check';
  groupCb.checked = groupAllOn;
  groupCb.title = groupAllOn ? t('results.deselectDuplicates') : t('results.selectDuplicates');
  groupCb.addEventListener('change', function () {
    toggleDuplicateSelection(groupPaths, 'group:' + (group.groupId || groupIdx));
  });
  const groupLbl = document.createElement('span');
  groupLbl.textContent = groupAllOn ? t('results.deselectDuplicates') : t('results.selectDuplicates');
  groupSelect.appendChild(groupCb);
  groupSelect.appendChild(groupLbl);

  const wasted = document.createElement('div');
  wasted.className = 'group-wasted';
  wasted.textContent = t('results.waste', { size: formatBytes(group.wastedBytes) });

  header.appendChild(info);
  header.appendChild(groupSelect);
  header.appendChild(wasted);

  const list = document.createElement('div');
  list.className = 'group-files-list';
  (group.files || []).forEach(function (file, fIdx) {
    list.appendChild(buildFileRow(group, file, fIdx));
  });
  card.appendChild(header);
  card.appendChild(list);
  return card;
}

/**
 * Riga file: checkbox, tag originale/duplicato, path cliccabile, mtime, Rinomina, Elimina.
 * Il path apre la cartella via `showItemInFolder`; nessun pulsante «Apri percorso».
 *
 * @param {Object} group
 * @param {Object} file
 * @param {number} fileIndex
 * @returns {HTMLElement}
 */
function buildFileRow(group, file, fileIndex) {
  const isOriginal = fileIndex === 0;
  const row = document.createElement('div');
  row.className = 'file-row' + (isOriginal ? ' is-original' : '');

  const main = document.createElement('div');
  main.className = 'file-main-info';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'file-check';
  cb.title = t('results.selectFile');
  cb.checked = !!state.selectedPaths[file.path];
  cb.disabled = isOriginal;
  cb.addEventListener('change', function () {
    if (cb.checked) {
      state.selectedPaths[file.path] = true;
    } else {
      delete state.selectedPaths[file.path];
    }
    logToMain('debug', 'Checkbox file ' + file.path + ' = ' + cb.checked);
    renderResults();
  });
  main.appendChild(cb);

  const tag = document.createElement('span');
  tag.className = 'file-tag ' + (isOriginal ? 'tag-original' : 'tag-duplicate');
  tag.textContent = isOriginal ? t('results.original') : t('results.duplicate');
  main.appendChild(tag);

  const pathScroll = document.createElement('div');
  pathScroll.className = 'file-path-scroll';
  const pathEl = document.createElement('span');
  pathEl.className = 'file-path-text';
  pathEl.title = file.path;
  pathEl.setAttribute('role', 'link');
  pathEl.setAttribute('aria-label', t('results.openPath') + ': ' + file.path);
  pathEl.tabIndex = 0;
  pathEl.textContent = file.path;
  pathEl.addEventListener('click', function () {
    openFilePath(file.path);
  });
  pathEl.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePath(file.path);
    }
  });
  pathScroll.appendChild(pathEl);
  main.appendChild(pathScroll);

  const meta = document.createElement('div');
  meta.className = 'file-meta';
  const mtime = document.createElement('span');
  mtime.className = 'file-mtime';
  mtime.textContent = file.mtimeMs ? new Date(file.mtimeMs).toLocaleString() : '';
  meta.appendChild(mtime);

  const actions = document.createElement('div');
  actions.className = 'file-row-actions';

  const renameBtn = document.createElement('button');
  renameBtn.type = 'button';
  renameBtn.className = 'btn btn-secondary btn-sm';
  renameBtn.textContent = t('results.rename');
  renameBtn.addEventListener('click', function () {
    askRenameFile(group, fileIndex);
  });
  actions.appendChild(renameBtn);

  if (!isOriginal) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-icon delete-hover btn-sm';
    del.textContent = t('results.delete');
    del.addEventListener('click', function () {
      askDeleteSingleFile(group, fileIndex);
    });
    actions.appendChild(del);
  }

  meta.appendChild(actions);
  row.appendChild(main);
  row.appendChild(meta);
  return row;
}

/**
 * Apre Esplora file / Finder sul file.
 *
 * @param {string} filePath
 * @returns {void}
 */
function openFilePath(filePath) {
  if (!filePath || !window.duploAPI || typeof window.duploAPI.showItemInFolder !== 'function') {
    return;
  }
  logToMain('info', 'Apri percorso: ' + filePath);
  window.duploAPI.showItemInFolder(filePath);
}
