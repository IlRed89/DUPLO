/**
 * @file fileCategories.js
 * @description Liste hardcoded di estensioni per il menu a tendina "Categoria".
 * Usato dal Renderer (script tag) e dai test Node (module.exports).
 *
 * Un array vuoto significa "nessun filtro": il motore analizza tutti i tipi di file.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.DuploFileCategories = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FILE_CATEGORIES = {
    all: {
      id: 'all',
      label: 'Tutti i file',
      extensions: []
    },
    images: {
      id: 'images',
      label: 'Immagini',
      extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
    },
    audio: {
      id: 'audio',
      label: 'Audio',
      extensions: ['.mp3', '.wav', '.flac', '.aac']
    },
    documents: {
      id: 'documents',
      label: 'Documenti',
      extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt']
    },
    video: {
      id: 'video',
      label: 'Video',
      extensions: ['.mp4', '.mkv', '.avi', '.mov']
    }
  };

  /**
   * Restituisce una copia dell'elenco estensioni per la categoria richiesta.
   * @param {string} categoryId
   * @returns {string[]}
   */
  function getCategoryExtensions(categoryId) {
    const cat = FILE_CATEGORIES[categoryId] || FILE_CATEGORIES.all;
    return cat.extensions.slice();
  }

  /**
   * Testo di aiuto da mostrare sotto la tendina (es. ".jpg, .png, …").
   * @param {string} categoryId
   * @returns {string}
   */
  function formatCategoryHint(categoryId) {
    const exts = getCategoryExtensions(categoryId);
    if (exts.length === 0) {
      return 'Nessun filtro: vengono analizzati tutti i tipi di file.';
    }
    return 'Estensioni: ' + exts.join(', ');
  }

  return {
    FILE_CATEGORIES,
    getCategoryExtensions,
    formatCategoryHint
  };
});
