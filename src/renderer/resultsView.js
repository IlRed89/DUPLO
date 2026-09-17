/**
 * @file resultsView.js
 * @description Vista risultati di DUPLO: badge criteri, sezioni, righe file.
 *
 * Caricato dopo `renderer.js` e `actionsView.js` così usa `state`, `dom`, `t`,
 * `logToMain`, `formatBytes`, `askRenameFile` e `askDeleteSingleFile`.
 * Nessun modulo Node: tutto passa da `window.duploAPI`.
 *
 * I file di un gruppo sono File #1, #2, #3… (mtime crescente). Non esiste
 * un «originale»: #1 è solo il più vecchio. «Seleziona dal 2° in poi»
 * lascia #1 deselezionato e spunta #2+.
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
 * Percorsi dal 2° file in poi (File #2, #3, …). File #1 non entra mai.
 *
 * @param {Array<Object>} groups
 * @returns {string[]}
 */
function collectFromSecondPaths(groups) {
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
 * True se ogni path della lista è in `state.selectedPaths`.
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
 * Toggle a due vie sul 2° file in poi: se tutti i target sono selezionati
 * li toglie, altrimenti li spunta. File #1 resta sempre deselezionato.
 *
 * @param {string[]} paths
 * @param {string} scope Etichetta di log (`section` / `group`).
 * @returns {void}
 */
function toggleFromSecondSelection(paths, scope) {
  const allOn = areAllPathsSelected(paths);
  if (allOn) {
    paths.forEach(function (p) {
      delete state.selectedPaths[p];
    });
    logToMain('info', '[Select] deselezionati ' + paths.length + ' file dal 2° in poi (' + scope + ')');
  } else {
    paths.forEach(function (p) {
      state.selectedPaths[p] = true;
    });
    logToMain('info', '[Select] selezionati ' + paths.length + ' file dal 2° in poi (' + scope + ')');
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

  const fromSecond = collectFromSecondPaths(groups);
  const allOn = areAllPathsSelected(fromSecond);
  const selectRow = document.createElement('label');
  selectRow.className = 'reason-section-select';
  const selectAll = document.createElement('input');
  selectAll.type = 'checkbox';
  selectAll.className = 'file-check';
  selectAll.checked = allOn;
  selectAll.title = allOn ? t('results.deselectFromSecond') : t('results.selectFromSecond');
  selectAll.addEventListener('click', function (event) {
    event.stopPropagation();
  });
  selectAll.addEventListener('change', function () {
    toggleFromSecondSelection(fromSecond, 'section:' + reason);
  });
  const selectLbl = document.createElement('span');
  selectLbl.textContent = allOn ? t('results.deselectFromSecond') : t('results.selectFromSecond');
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
 * Disegna i gruppi (già ordinati 1..N dal Main) sezionati per criteri AND.
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
  let totalSizeBytes = 0;
  state.duplicateGroups.forEach(function (g) {
    totalDuplicates += Math.max(0, g.fileCount - 1);
    totalSizeBytes += (Number(g.size) || 0) * (Number(g.fileCount) || 0);
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
  if (dom.statTotalSize) {
    dom.statTotalSize.textContent = formatBytes(totalSizeBytes);
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

  logToMain('debug', '[Results] render ' + state.duplicateGroups.length + ' gruppi, ids=' +
    state.duplicateGroups.map(function (g) { return g.groupId; }).join(','));

  const sections = groupResultsByMatchReason(state.duplicateGroups);
  const host = dom.resultsList || dom.resultsScrollContainer;
  sections.forEach(function (section) {
    host.appendChild(buildReasonSection(section.reason, section.groups, section.criteria));
  });
}

/**
 * Card di un set identico (File #1, #2, …) dentro una macro-sezione.
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

  const groupPaths = collectFromSecondPaths([group]);
  const groupAllOn = areAllPathsSelected(groupPaths);
  const groupSelect = document.createElement('label');
  groupSelect.className = 'reason-section-select';
  const groupCb = document.createElement('input');
  groupCb.type = 'checkbox';
  groupCb.className = 'file-check';
  groupCb.checked = groupAllOn;
  groupCb.title = groupAllOn ? t('results.deselectFromSecond') : t('results.selectFromSecond');
  groupCb.addEventListener('change', function () {
    toggleFromSecondSelection(groupPaths, 'group:' + (group.groupId || groupIdx));
  });
  const groupLbl = document.createElement('span');
  groupLbl.textContent = groupAllOn ? t('results.deselectFromSecond') : t('results.selectFromSecond');
  groupSelect.appendChild(groupCb);
  groupSelect.appendChild(groupLbl);

  const sizeEl = document.createElement('div');
  sizeEl.className = 'group-size';
  sizeEl.textContent = t('results.size', { size: formatBytes(group.size) });

  header.appendChild(info);
  header.appendChild(groupSelect);
  header.appendChild(sizeEl);

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
 * Riga file: checkbox, etichetta File #N, path cliccabile, mtime, Rinomina, Elimina.
 *
 * @param {Object} group
 * @param {Object} file
 * @param {number} fileIndex
 * @returns {HTMLElement}
 */
function buildFileRow(group, file, fileIndex) {
  const isFirst = fileIndex === 0;
  const ordinal = fileIndex + 1;
  const row = document.createElement('div');
  row.className = 'file-row' + (isFirst ? ' is-first' : '');
  row.dataset.fileIndex = String(ordinal);
  row.dataset.filePath = file.path || '';

  const main = document.createElement('div');
  main.className = 'file-main-info';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'file-check';
  cb.title = t('results.selectFile');
  cb.checked = !!state.selectedPaths[file.path];
  cb.addEventListener('change', function () {
    if (cb.checked) {
      state.selectedPaths[file.path] = true;
    } else {
      delete state.selectedPaths[file.path];
    }
    logToMain('debug', '[Select] File #' + ordinal + ' ' + file.path + ' = ' + cb.checked);
    renderResults();
  });
  main.appendChild(cb);

  const tag = document.createElement('span');
  tag.className = 'file-tag tag-index';
  tag.textContent = t('results.fileIndex', { n: ordinal });
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
    logToMain('info', '[Rename] click File #' + ordinal + ' "' + file.path + '"');
    askRenameFile(group, fileIndex);
  });
  actions.appendChild(renameBtn);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-icon delete-hover btn-sm';
  del.textContent = t('results.delete');
  del.addEventListener('click', function () {
    askDeleteSingleFile(group, fileIndex);
  });
  actions.appendChild(del);

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
