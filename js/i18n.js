'use strict';

/*
 * Hollow Feast localization.
 *
 * Ships nine locales (en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR,
 * it-IT). The locale is chosen from ?lang=, then localStorage('hf.lang'), then
 * navigator.languages (exact tag, then base language), falling back to en-US.
 * Strings are applied to any element carrying data-i18n (text content) or
 * data-i18n-aria (aria-label). Numbers stay locale-independent so the HUD and
 * the automated playthrough read the same values everywhere.
 */
(function () {
  const STRINGS = {
    'en-US': {
      controls: 'Game controls',
      subtitle: 'Game index 56 · collection action',
      howto: 'Eat the glowing morsels in numbered order. Arrow keys, WASD, or the buttons below. R restarts.',
      score: 'Score', eaten: 'Eaten',
      moveLeft: 'Move left', moveUp: 'Move up', moveDown: 'Move down', moveRight: 'Move right',
      restart: 'Restart round', playfield: 'Hollow Feast playfield',
      win: 'Feast complete!',
    },
    'en-GB': {
      controls: 'Game controls',
      subtitle: 'Game index 56 · collection action',
      howto: 'Eat the glowing morsels in numbered order. Arrow keys, WASD, or the buttons below. R restarts.',
      score: 'Score', eaten: 'Eaten',
      moveLeft: 'Move left', moveUp: 'Move up', moveDown: 'Move down', moveRight: 'Move right',
      restart: 'Restart round', playfield: 'Hollow Feast playfield',
      win: 'Feast complete!',
    },
    'es-419': {
      controls: 'Controles del juego',
      subtitle: 'Juego n.º 56 · acción de recolección',
      howto: 'Devora los bocados brillantes en orden numérico. Usa las flechas, WASD o los botones. R reinicia.',
      score: 'Puntaje', eaten: 'Comidos',
      moveLeft: 'Mover a la izquierda', moveUp: 'Mover arriba', moveDown: 'Mover abajo', moveRight: 'Mover a la derecha',
      restart: 'Reiniciar ronda', playfield: 'Campo de juego de Hollow Feast',
      win: '¡Festín completo!',
    },
    'es-ES': {
      controls: 'Controles del juego',
      subtitle: 'Juego n.º 56 · acción de recolección',
      howto: 'Devórate los bocados brillantes en orden numérico. Usa las flechas, WASD o los botones. R reinicia.',
      score: 'Puntuación', eaten: 'Comidos',
      moveLeft: 'Mover a la izquierda', moveUp: 'Mover arriba', moveDown: 'Mover abajo', moveRight: 'Mover a la derecha',
      restart: 'Reiniciar ronda', playfield: 'Campo de juego de Hollow Feast',
      win: '¡Festín completo!',
    },
    'de-DE': {
      controls: 'Spielsteuerung',
      subtitle: 'Spiel Nr. 56 · Sammel-Action',
      howto: 'Verschlinge die leuchtenden Happen in der richtigen Reihenfolge. Pfeiltasten, WASD oder die Schaltflächen. R startet neu.',
      score: 'Punkte', eaten: 'Gegessen',
      moveLeft: 'Nach links bewegen', moveUp: 'Nach oben bewegen', moveDown: 'Nach unten bewegen', moveRight: 'Nach rechts bewegen',
      restart: 'Runde neu starten', playfield: 'Hollow-Feast-Spielfeld',
      win: 'Festmahl vollendet!',
    },
    'fr-FR': {
      controls: 'Commandes du jeu',
      subtitle: 'Jeu n° 56 · action de collecte',
      howto: 'Avalez les bouchées lumineuses dans l’ordre numéroté. Flèches, WASD ou les boutons. R relance.',
      score: 'Score', eaten: 'Avalés',
      moveLeft: 'Aller à gauche', moveUp: 'Aller vers le haut', moveDown: 'Aller vers le bas', moveRight: 'Aller à droite',
      restart: 'Recommencer la manche', playfield: 'Aire de jeu de Hollow Feast',
      win: 'Festin achevé !',
    },
    'fr-CA': {
      controls: 'Commandes du jeu',
      subtitle: 'Jeu n° 56 · action de collecte',
      howto: 'Avalez les bouchées lumineuses dans l’ordre numéroté. Flèches, WASD ou les boutons. R redémarre.',
      score: 'Pointage', eaten: 'Avalés',
      moveLeft: 'Aller à gauche', moveUp: 'Aller vers le haut', moveDown: 'Aller vers le bas', moveRight: 'Aller à droite',
      restart: 'Recommencer la manche', playfield: 'Aire de jeu de Hollow Feast',
      win: 'Festin terminé !',
    },
    'pt-BR': {
      controls: 'Controles do jogo',
      subtitle: 'Jogo n.º 56 · ação de coleta',
      howto: 'Devore os petiscos brilhantes na ordem numérica. Setas, WASD ou os botões. R reinicia.',
      score: 'Pontos', eaten: 'Comidos',
      moveLeft: 'Mover para a esquerda', moveUp: 'Mover para cima', moveDown: 'Mover para baixo', moveRight: 'Mover para a direita',
      restart: 'Reiniciar rodada', playfield: 'Campo de jogo de Hollow Feast',
      win: 'Banquete completo!',
    },
    'it-IT': {
      controls: 'Comandi di gioco',
      subtitle: 'Gioco n. 56 · azione di raccolta',
      howto: 'Divora i bocconi luminosi nell’ordine numerato. Frecce, WASD o i pulsanti. R ricomincia.',
      score: 'Punteggio', eaten: 'Mangiati',
      moveLeft: 'Sposta a sinistra', moveUp: 'Sposta in alto', moveDown: 'Sposta in basso', moveRight: 'Sposta a destra',
      restart: 'Ricomincia il round', playfield: 'Campo di gioco di Hollow Feast',
      win: 'Banchetto completato!',
    },
  };

  const BASE = { en: 'en-US', es: 'es-419', de: 'de-DE', fr: 'fr-FR', pt: 'pt-BR', it: 'it-IT' };

  function pick() {
    const tags = [];
    try {
      const q = new URLSearchParams(window.location.search).get('lang');
      if (q) tags.push(q);
      const saved = window.localStorage && window.localStorage.getItem('hf.lang');
      if (saved) tags.push(saved);
    } catch (_) { /* private mode or opaque origin: fall through */ }
    const navTags = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || 'en-US'];
    for (let i = 0; i < navTags.length; i++) tags.push(navTags[i]);
    for (let i = 0; i < tags.length; i++) {
      const tag = String(tags[i]);
      if (STRINGS[tag]) return tag;
      const canon = tag.split('-')[0].toLowerCase() + (tag.split('-')[1] ? '-' + tag.split('-')[1].toUpperCase() : '');
      if (STRINGS[canon]) return canon;
      const base = BASE[tag.split('-')[0].toLowerCase()];
      if (base) return base;
    }
    return 'en-US';
  }

  const lang = pick();
  const dict = STRINGS[lang];

  function t(key) {
    return (dict && dict[key]) || STRINGS['en-US'][key] || key;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.documentElement.lang = lang;
  }

  window.__hf_i18n = { lang: lang, t: t, apply: apply, locales: Object.keys(STRINGS) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
  else apply();
})();
