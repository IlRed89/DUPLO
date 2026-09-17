/**
 * @file appDialog.js
 * @description Modali a tema di DUPLO (warning / error / confirm / prompt).
 *
 * Sostituisce `alert()`, `confirm()` e `prompt()` nativi, che ignorano
 * `[data-theme]` e spezzano l'estetica scura/chiara. Tutti i dialoghi
 * usano le variabili CSS (`--bg-sidebar`, `--text-heading`, `--danger`, …).
 *
 * API globale: `window.DuploDialog.alert|confirm|prompt` (Promise).
 */
'use strict';

(function (root) {
  /** @type {((result: { ok: boolean, value?: string }) => void)|null} */
  let resolver = null;

  /**
   * Riferimenti DOM del dialogo unico.
   * @returns {{ overlay: HTMLElement|null, dialog: HTMLElement|null, title: HTMLElement|null, message: HTMLElement|null, inputWrap: HTMLElement|null, input: HTMLInputElement|null, cancel: HTMLElement|null, confirm: HTMLElement|null }}
   */
  function els() {
    return {
      overlay: document.getElementById('confirmModal'),
      dialog: document.querySelector('#confirmModal .modal-dialog'),
      title: document.getElementById('modalTitle'),
      message: document.getElementById('modalMessage'),
      inputWrap: document.getElementById('modalInputWrap'),
      input: document.getElementById('modalInput'),
      cancel: document.getElementById('btnModalCancel'),
      confirm: document.getElementById('btnModalConfirm')
    };
  }

  /**
   * Chiude il dialogo e risolve la Promise pendente.
   *
   * @param {boolean} ok
   * @param {string} [value]
   * @returns {void}
   */
  function finish(ok, value) {
    const nodes = els();
    if (nodes.overlay) {
      nodes.overlay.style.display = 'none';
      nodes.overlay.setAttribute('aria-hidden', 'true');
    }
    const resolve = resolver;
    resolver = null;
    if (typeof resolve === 'function') {
      resolve({ ok: !!ok, value: value == null ? '' : String(value) });
    }
  }

  /**
   * Apre il dialogo a tema. Una sola istanza: un'apertura chiude la precedente.
   *
   * @param {{
   *   kind?: 'info'|'warning'|'error'|'confirm'|'prompt',
   *   title: string,
   *   message: string,
   *   html?: boolean,
   *   value?: string,
   *   confirmLabel?: string,
   *   cancelLabel?: string
   * }} opts
   * @returns {Promise<{ ok: boolean, value: string }>}
   */
  function open(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const kind = options.kind || 'info';
    if (resolver) {
      finish(false, '');
    }
    return new Promise(function (resolve) {
      resolver = resolve;
      const nodes = els();
      if (!nodes.overlay || !nodes.dialog) {
        resolve({ ok: false, value: '' });
        return;
      }
      nodes.dialog.className = 'modal-dialog modal-dialog--' + kind;
      if (nodes.title) {
        nodes.title.textContent = options.title || '';
      }
      if (nodes.message) {
        if (options.html) {
          nodes.message.innerHTML = options.message || '';
        } else {
          nodes.message.textContent = options.message || '';
        }
      }
      const isPrompt = kind === 'prompt';
      const isAlert = kind === 'info' || kind === 'warning' || kind === 'error';
      if (nodes.inputWrap) {
        nodes.inputWrap.hidden = !isPrompt;
      }
      if (nodes.input) {
        nodes.input.value = isPrompt ? String(options.value || '') : '';
      }
      if (nodes.confirm) {
        nodes.confirm.style.display = 'inline-flex';
        const label = options.confirmLabel
          || (isAlert ? (window.DuploI18n ? window.DuploI18n.t('modal.ok') : 'OK') : (window.DuploI18n ? window.DuploI18n.t('modal.confirmDelete') : 'OK'));
        const span = nodes.confirm.querySelector('span') || nodes.confirm;
        span.textContent = label;
        nodes.confirm.className = 'btn btn-sm ' + (kind === 'error' || kind === 'confirm' ? 'btn-danger' : 'btn-primary');
      }
      if (nodes.cancel) {
        nodes.cancel.style.display = isAlert ? 'none' : 'inline-flex';
        const cancelLabel = options.cancelLabel || (window.DuploI18n ? window.DuploI18n.t('modal.cancel') : 'Annulla');
        const span = nodes.cancel.querySelector('span') || nodes.cancel;
        span.textContent = cancelLabel;
      }
      nodes.overlay.style.display = 'flex';
      nodes.overlay.setAttribute('aria-hidden', 'false');
      try {
        if (window.duploAPI && typeof window.duploAPI.logRendererEvent === 'function') {
          window.duploAPI.logRendererEvent('info', '[Dialog] kind=' + kind + ' title="' + (options.title || '') + '"');
        }
      } catch (_err) {
        /* ignore */
      }
      window.setTimeout(function () {
        if (isPrompt && nodes.input) {
          nodes.input.focus();
          nodes.input.select();
        } else if (nodes.confirm) {
          nodes.confirm.focus();
        }
      }, 0);
    });
  }

  /**
   * Avviso / errore (un pulsante OK).
   * @param {{ kind?: 'info'|'warning'|'error', title: string, message: string, html?: boolean }} opts
   * @returns {Promise<{ ok: boolean, value: string }>}
   */
  function alertDialog(opts) {
    const kind = opts && opts.kind ? opts.kind : 'warning';
    return open({
      kind: kind,
      title: opts && opts.title,
      message: opts && opts.message,
      html: !!(opts && opts.html),
      confirmLabel: opts && opts.confirmLabel
    });
  }

  /**
   * Conferma (Annulla + Conferma).
   * @param {{ title: string, message: string, html?: boolean, confirmLabel?: string }} opts
   * @returns {Promise<boolean>}
   */
  function confirmDialog(opts) {
    return open({
      kind: 'confirm',
      title: opts && opts.title,
      message: opts && opts.message,
      html: !!(opts && opts.html),
      confirmLabel: opts && opts.confirmLabel,
      cancelLabel: opts && opts.cancelLabel
    }).then(function (res) {
      return !!(res && res.ok);
    });
  }

  /**
   * Prompt con input (rinomina).
   * @param {{ title: string, message: string, value?: string, confirmLabel?: string }} opts
   * @returns {Promise<string|null>}
   */
  function promptDialog(opts) {
    return open({
      kind: 'prompt',
      title: opts && opts.title,
      message: opts && opts.message,
      value: opts && opts.value,
      confirmLabel: opts && opts.confirmLabel,
      cancelLabel: opts && opts.cancelLabel
    }).then(function (res) {
      if (!res || !res.ok) {
        return null;
      }
      return res.value;
    });
  }

  function onConfirmClick() {
    const nodes = els();
    const value = nodes.input && !nodes.inputWrap.hidden ? nodes.input.value : '';
    finish(true, value);
  }

  function onCancelClick() {
    finish(false, '');
  }

  function onKeyDown(event) {
    const nodes = els();
    if (!nodes.overlay || nodes.overlay.style.display === 'none') {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false, '');
    } else if (event.key === 'Enter') {
      const tag = event.target && event.target.tagName;
      if (tag === 'TEXTAREA') {
        return;
      }
      event.preventDefault();
      const value = nodes.input && nodes.inputWrap && !nodes.inputWrap.hidden ? nodes.input.value : '';
      finish(true, value);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const nodes = els();
    if (nodes.confirm) {
      nodes.confirm.addEventListener('click', onConfirmClick);
    }
    if (nodes.cancel) {
      nodes.cancel.addEventListener('click', onCancelClick);
    }
    if (nodes.overlay) {
      nodes.overlay.addEventListener('click', function (event) {
        if (event.target === nodes.overlay) {
          finish(false, '');
        }
      });
    }
    document.addEventListener('keydown', onKeyDown);
  });

  root.DuploDialog = {
    open: open,
    alert: alertDialog,
    confirm: confirmDialog,
    prompt: promptDialog,
    close: function () {
      finish(false, '');
    }
  };
})(typeof window !== 'undefined' ? window : this);
