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
      'sh.account': 'Account',
      'sh.signIn': "Sign in with StarHermit", 'sh.invite': "Invite a friend", 'sh.copied': "Invite link copied to clipboard.", 'sh.copyFailed': "Could not copy the invite link: {link}", 'sh.signedOut': "Signed out of StarHermit. Progress keeps saving on this device.",
      controls: 'Game controls',
      subtitle: 'Game index 56 · collection action',
      howto: 'Eat the glowing morsels in numbered order. Arrow keys, WASD, or the buttons below. R restarts.',
      score: 'Score', eaten: 'Eaten',
      moveLeft: 'Move left', moveUp: 'Move up', moveDown: 'Move down', moveRight: 'Move right',
      restart: 'Restart round', playfield: 'Hollow Feast playfield',
      win: 'Feast complete!',
      player: 'Player', best: 'Best', sync: 'Sync',
      syncLocal: 'Local', syncLoading: 'Loading', syncSaving: 'Saving',
      syncSynced: 'Synced', syncOffline: 'Offline', syncError: 'Error',
      localPlayer: 'Local player',
    },
    'en-GB': {
      'sh.account': 'Account',
      'sh.signIn': "Sign in with StarHermit", 'sh.invite': "Invite a friend", 'sh.copied': "Invite link copied to clipboard.", 'sh.copyFailed': "Could not copy the invite link: {link}", 'sh.signedOut': "Signed out of StarHermit. Progress keeps saving on this device.",
      controls: 'Game controls',
      subtitle: 'Game index 56 · collection action',
      howto: 'Eat the glowing morsels in numbered order. Arrow keys, WASD, or the buttons below. R restarts.',
      score: 'Score', eaten: 'Eaten',
      moveLeft: 'Move left', moveUp: 'Move up', moveDown: 'Move down', moveRight: 'Move right',
      restart: 'Restart round', playfield: 'Hollow Feast playfield',
      win: 'Feast complete!',
      player: 'Player', best: 'Best', sync: 'Sync',
      syncLocal: 'Local', syncLoading: 'Loading', syncSaving: 'Saving',
      syncSynced: 'Synced', syncOffline: 'Offline', syncError: 'Error',
      localPlayer: 'Local player',
    },
    'es-419': {
      'sh.account': 'Cuenta',
      'sh.signIn': "Iniciar sesión con StarHermit", 'sh.invite': "Invitar a un amigo", 'sh.copied': "Enlace de invitación copiado al portapapeles.", 'sh.copyFailed': "No se pudo copiar el enlace de invitación: {link}", 'sh.signedOut': "Sesión de StarHermit cerrada. El progreso se sigue guardando en este dispositivo.",
      controls: 'Controles del juego',
      subtitle: 'Juego n.º 56 · acción de recolección',
      howto: 'Devora los bocados brillantes en orden numérico. Usa las flechas, WASD o los botones. R reinicia.',
      score: 'Puntaje', eaten: 'Comidos',
      moveLeft: 'Mover a la izquierda', moveUp: 'Mover arriba', moveDown: 'Mover abajo', moveRight: 'Mover a la derecha',
      restart: 'Reiniciar ronda', playfield: 'Campo de juego de Hollow Feast',
      win: '¡Festín completo!',
      player: 'Jugador', best: 'Mejor', sync: 'Sinc.',
      syncLocal: 'Local', syncLoading: 'Cargando', syncSaving: 'Guardando',
      syncSynced: 'Sincronizado', syncOffline: 'Sin conexión', syncError: 'Error',
      localPlayer: 'Jugador local',
    },
    'es-ES': {
      'sh.account': 'Cuenta',
      'sh.signIn': "Iniciar sesión con StarHermit", 'sh.invite': "Invitar a un amigo", 'sh.copied': "Enlace de invitación copiado al portapapeles.", 'sh.copyFailed': "No se ha podido copiar el enlace de invitación: {link}", 'sh.signedOut': "Se ha cerrado la sesión de StarHermit. El progreso se sigue guardando en este dispositivo.",
      controls: 'Controles del juego',
      subtitle: 'Juego n.º 56 · acción de recolección',
      howto: 'Devórate los bocados brillantes en orden numérico. Usa las flechas, WASD o los botones. R reinicia.',
      score: 'Puntuación', eaten: 'Comidos',
      moveLeft: 'Mover a la izquierda', moveUp: 'Mover arriba', moveDown: 'Mover abajo', moveRight: 'Mover a la derecha',
      restart: 'Reiniciar ronda', playfield: 'Campo de juego de Hollow Feast',
      win: '¡Festín completo!',
      player: 'Jugador', best: 'Mejor', sync: 'Sinc.',
      syncLocal: 'Local', syncLoading: 'Cargando', syncSaving: 'Guardando',
      syncSynced: 'Sincronizado', syncOffline: 'Sin conexión', syncError: 'Error',
      localPlayer: 'Jugador local',
    },
    'de-DE': {
      'sh.account': 'Konto',
      'sh.signIn': "Mit StarHermit anmelden", 'sh.invite': "Freund einladen", 'sh.copied': "Einladungslink in die Zwischenablage kopiert.", 'sh.copyFailed': "Einladungslink konnte nicht kopiert werden: {link}", 'sh.signedOut': "Von StarHermit abgemeldet. Der Fortschritt wird weiter auf diesem Gerät gespeichert.",
      controls: 'Spielsteuerung',
      subtitle: 'Spiel Nr. 56 · Sammel-Action',
      howto: 'Verschlinge die leuchtenden Happen in der richtigen Reihenfolge. Pfeiltasten, WASD oder die Schaltflächen. R startet neu.',
      score: 'Punkte', eaten: 'Gegessen',
      moveLeft: 'Nach links bewegen', moveUp: 'Nach oben bewegen', moveDown: 'Nach unten bewegen', moveRight: 'Nach rechts bewegen',
      restart: 'Runde neu starten', playfield: 'Hollow-Feast-Spielfeld',
      win: 'Festmahl vollendet!',
      player: 'Spieler', best: 'Rekord', sync: 'Sync',
      syncLocal: 'Lokal', syncLoading: 'Laden', syncSaving: 'Speichert',
      syncSynced: 'Gesichert', syncOffline: 'Offline', syncError: 'Fehler',
      localPlayer: 'Lokaler Spieler',
    },
    'fr-FR': {
      'sh.account': 'Compte',
      'sh.signIn': "Se connecter avec StarHermit", 'sh.invite': "Inviter un ami", 'sh.copied': "Lien d’invitation copié dans le presse-papiers.", 'sh.copyFailed': "Impossible de copier le lien d’invitation : {link}", 'sh.signedOut': "Déconnecté de StarHermit. La progression reste enregistrée sur cet appareil.",
      controls: 'Commandes du jeu',
      subtitle: 'Jeu n° 56 · action de collecte',
      howto: 'Avalez les bouchées lumineuses dans l’ordre numéroté. Flèches, WASD ou les boutons. R relance.',
      score: 'Score', eaten: 'Avalés',
      moveLeft: 'Aller à gauche', moveUp: 'Aller vers le haut', moveDown: 'Aller vers le bas', moveRight: 'Aller à droite',
      restart: 'Recommencer la manche', playfield: 'Aire de jeu de Hollow Feast',
      win: 'Festin achevé !',
      player: 'Joueur', best: 'Record', sync: 'Sync',
      syncLocal: 'Local', syncLoading: 'Chargement', syncSaving: 'Sauvegarde',
      syncSynced: 'Synchronisé', syncOffline: 'Hors ligne', syncError: 'Erreur',
      localPlayer: 'Joueur local',
    },
    'fr-CA': {
      'sh.account': 'Compte',
      'sh.signIn': "Se connecter avec StarHermit", 'sh.invite': "Inviter un ami", 'sh.copied': "Lien d’invitation copié dans le presse-papiers.", 'sh.copyFailed': "Impossible de copier le lien d’invitation : {link}", 'sh.signedOut': "Déconnecté de StarHermit. La progression reste enregistrée sur cet appareil.",
      controls: 'Commandes du jeu',
      subtitle: 'Jeu n° 56 · action de collecte',
      howto: 'Avalez les bouchées lumineuses dans l’ordre numéroté. Flèches, WASD ou les boutons. R redémarre.',
      score: 'Pointage', eaten: 'Avalés',
      moveLeft: 'Aller à gauche', moveUp: 'Aller vers le haut', moveDown: 'Aller vers le bas', moveRight: 'Aller à droite',
      restart: 'Recommencer la manche', playfield: 'Aire de jeu de Hollow Feast',
      win: 'Festin terminé !',
      player: 'Joueur', best: 'Record', sync: 'Sync',
      syncLocal: 'Local', syncLoading: 'Chargement', syncSaving: 'Sauvegarde',
      syncSynced: 'Synchronisé', syncOffline: 'Hors ligne', syncError: 'Erreur',
      localPlayer: 'Joueur local',
    },
    'pt-BR': {
      'sh.account': 'Conta',
      'sh.signIn': "Entrar com StarHermit", 'sh.invite': "Convidar um amigo", 'sh.copied': "Link de convite copiado para a área de transferência.", 'sh.copyFailed': "Não foi possível copiar o link de convite: {link}", 'sh.signedOut': "Você saiu do StarHermit. O progresso continua salvo neste dispositivo.",
      controls: 'Controles do jogo',
      subtitle: 'Jogo n.º 56 · ação de coleta',
      howto: 'Devore os petiscos brilhantes na ordem numérica. Setas, WASD ou os botões. R reinicia.',
      score: 'Pontos', eaten: 'Comidos',
      moveLeft: 'Mover para a esquerda', moveUp: 'Mover para cima', moveDown: 'Mover para baixo', moveRight: 'Mover para a direita',
      restart: 'Reiniciar rodada', playfield: 'Campo de jogo de Hollow Feast',
      win: 'Banquete completo!',
      player: 'Jogador', best: 'Melhor', sync: 'Sinc.',
      syncLocal: 'Local', syncLoading: 'Carregando', syncSaving: 'Salvando',
      syncSynced: 'Sincronizado', syncOffline: 'Offline', syncError: 'Erro',
      localPlayer: 'Jogador local',
    },
    'it-IT': {
      'sh.account': 'Account',
      'sh.signIn': "Accedi con StarHermit", 'sh.invite': "Invita un amico", 'sh.copied': "Link di invito copiato negli appunti.", 'sh.copyFailed': "Impossibile copiare il link di invito: {link}", 'sh.signedOut': "Disconnesso da StarHermit. I progressi restano salvati su questo dispositivo.",
      controls: 'Comandi di gioco',
      subtitle: 'Gioco n. 56 · azione di raccolta',
      howto: 'Divora i bocconi luminosi nell’ordine numerato. Frecce, WASD o i pulsanti. R ricomincia.',
      score: 'Punteggio', eaten: 'Mangiati',
      moveLeft: 'Sposta a sinistra', moveUp: 'Sposta in alto', moveDown: 'Sposta in basso', moveRight: 'Sposta a destra',
      restart: 'Ricomincia il round', playfield: 'Campo di gioco di Hollow Feast',
      win: 'Banchetto completato!',
      player: 'Giocatore', best: 'Migliore', sync: 'Sinc.',
      syncLocal: 'Locale', syncLoading: 'Caricamento', syncSaving: 'Salvataggio',
      syncSynced: 'Sincronizzato', syncOffline: 'Offline', syncError: 'Errore',
      localPlayer: 'Giocatore locale',
    },
  };

  // Settings panel / Graphics section strings (merged into STRINGS above).
  const GFX_EN = {
    settings: 'Settings', graphics: 'Graphics', close: 'Close settings',
    gfxQuality: 'Quality', gfxAuto: 'Auto (detected: {tier})',
    tierLow: 'Low', tierBalanced: 'Balanced', tierHigh: 'High', tierUltra: 'Ultra',
    gfxScale: 'Render scale', gfxFromPreset: 'From preset ({tier})',
    cat_shadows: 'Shadows', cat_ao: 'Ambient occlusion', cat_bloom: 'Bloom', cat_grade: 'Color grade',
    cat_antialias: 'Anti-aliasing', cat_reflections: 'Reflections', cat_detail: 'Table detail', cat_particles: 'Floating motes',
    t_off: 'Off', t_on: 'On', t_low: 'Low', t_medium: 'Medium', t_high: 'High',
    t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Plain', t_detailed: 'Detailed',
    gfxAdaptive: 'Adaptive resolution', gfxFps: 'Show frame rate',
    gfxPostFailed: 'Post-processing is unavailable on this device, so the board renders without it.',
    gpuUnknown: 'unknown GPU',
    sum_noShadows: 'no shadows', sum_shadows: 'shadows', sum_ao: 'ambient occlusion', sum_aoHigh: 'full ambient occlusion',
    sum_bloom: 'bloom', sum_reflections: 'reflections', sum_noAA: 'no anti-aliasing', sum_particles: 'motes',
  };
  const GFX_ES = {
    settings: 'Ajustes', graphics: 'Gráficos', close: 'Cerrar ajustes',
    gfxQuality: 'Calidad', gfxAuto: 'Automático (detectado: {tier})',
    tierLow: 'Baja', tierBalanced: 'Equilibrada', tierHigh: 'Alta', tierUltra: 'Ultra',
    gfxScale: 'Escala de renderizado', gfxFromPreset: 'Según calidad ({tier})',
    cat_shadows: 'Sombras', cat_ao: 'Oclusión ambiental', cat_bloom: 'Resplandor', cat_grade: 'Corrección de color',
    cat_antialias: 'Antialiasing', cat_reflections: 'Reflejos', cat_detail: 'Detalle de la mesa', cat_particles: 'Motas flotantes',
    t_off: 'No', t_on: 'Sí', t_low: 'Bajo', t_medium: 'Medio', t_high: 'Alto',
    t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Sencillo', t_detailed: 'Detallado',
    gfxAdaptive: 'Resolución adaptativa', gfxFps: 'Mostrar fotogramas por segundo',
    gfxPostFailed: 'El posprocesado no está disponible en este dispositivo; el tablero se muestra sin él.',
    gpuUnknown: 'GPU desconocida',
    sum_noShadows: 'sin sombras', sum_shadows: 'sombras', sum_ao: 'oclusión ambiental', sum_aoHigh: 'oclusión ambiental completa',
    sum_bloom: 'resplandor', sum_reflections: 'reflejos', sum_noAA: 'sin antialiasing', sum_particles: 'motas',
  };
  const GFX_FR = {
    settings: 'Paramètres', graphics: 'Graphismes', close: 'Fermer les paramètres',
    gfxQuality: 'Qualité', gfxAuto: 'Auto (détecté : {tier})',
    tierLow: 'Basse', tierBalanced: 'Équilibrée', tierHigh: 'Haute', tierUltra: 'Ultra',
    gfxScale: 'Échelle de rendu', gfxFromPreset: 'Selon la qualité ({tier})',
    cat_shadows: 'Ombres', cat_ao: 'Occlusion ambiante', cat_bloom: 'Halo lumineux', cat_grade: 'Étalonnage des couleurs',
    cat_antialias: 'Anticrénelage', cat_reflections: 'Reflets', cat_detail: 'Détail de la table', cat_particles: 'Poussières flottantes',
    t_off: 'Non', t_on: 'Oui', t_low: 'Bas', t_medium: 'Moyen', t_high: 'Élevé',
    t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Simple', t_detailed: 'Détaillé',
    gfxAdaptive: 'Résolution adaptative', gfxFps: 'Afficher les images par seconde',
    gfxPostFailed: 'Le post-traitement est indisponible sur cet appareil ; le plateau s’affiche sans lui.',
    gpuUnknown: 'GPU inconnu',
    sum_noShadows: 'sans ombres', sum_shadows: 'ombres', sum_ao: 'occlusion ambiante', sum_aoHigh: 'occlusion ambiante complète',
    sum_bloom: 'halo', sum_reflections: 'reflets', sum_noAA: 'sans anticrénelage', sum_particles: 'poussières',
  };
  const GFX = {
    'en-US': GFX_EN,
    'en-GB': Object.assign({}, GFX_EN, { cat_grade: 'Colour grade' }),
    'es-419': GFX_ES,
    'es-ES': Object.assign({}, GFX_ES, { gfxAuto: 'Automática (detectada: {tier})' }),
    'de-DE': {
      settings: 'Einstellungen', graphics: 'Grafik', close: 'Einstellungen schließen',
      gfxQuality: 'Qualität', gfxAuto: 'Automatisch (erkannt: {tier})',
      tierLow: 'Niedrig', tierBalanced: 'Ausgewogen', tierHigh: 'Hoch', tierUltra: 'Ultra',
      gfxScale: 'Renderskalierung', gfxFromPreset: 'Laut Stufe ({tier})',
      cat_shadows: 'Schatten', cat_ao: 'Umgebungs\u00ADverdeckung', cat_bloom: 'Leuchteffekt', cat_grade: 'Farbkorrektur',
      cat_antialias: 'Kantenglättung', cat_reflections: 'Spiegelungen', cat_detail: 'Tischdetails', cat_particles: 'Schwebende Funken',
      t_off: 'Aus', t_on: 'An', t_low: 'Niedrig', t_medium: 'Mittel', t_high: 'Hoch',
      t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Schlicht', t_detailed: 'Detailliert',
      gfxAdaptive: 'Adaptive Auflösung', gfxFps: 'Bildrate anzeigen',
      gfxPostFailed: 'Nachbearbeitung ist auf diesem Gerät nicht verfügbar, das Brett wird ohne sie dargestellt.',
      gpuUnknown: 'unbekannte GPU',
      sum_noShadows: 'keine Schatten', sum_shadows: 'Schatten', sum_ao: 'Umgebungsverdeckung', sum_aoHigh: 'volle Umgebungsverdeckung',
      sum_bloom: 'Leuchten', sum_reflections: 'Spiegelungen', sum_noAA: 'keine Kantenglättung', sum_particles: 'Funken',
    },
    'fr-FR': GFX_FR,
    'fr-CA': Object.assign({}, GFX_FR, { cat_bloom: 'Effet de lueur', sum_bloom: 'lueur' }),
    'pt-BR': {
      settings: 'Configurações', graphics: 'Gráficos', close: 'Fechar configurações',
      gfxQuality: 'Qualidade', gfxAuto: 'Automática (detectada: {tier})',
      tierLow: 'Baixa', tierBalanced: 'Equilibrada', tierHigh: 'Alta', tierUltra: 'Ultra',
      gfxScale: 'Escala de renderização', gfxFromPreset: 'Conforme a qualidade ({tier})',
      cat_shadows: 'Sombras', cat_ao: 'Oclusão ambiente', cat_bloom: 'Brilho', cat_grade: 'Correção de cor',
      cat_antialias: 'Antisserrilhado', cat_reflections: 'Reflexos', cat_detail: 'Detalhe da mesa', cat_particles: 'Partículas flutuantes',
      t_off: 'Desligado', t_on: 'Ligado', t_low: 'Baixo', t_medium: 'Médio', t_high: 'Alto',
      t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Simples', t_detailed: 'Detalhado',
      gfxAdaptive: 'Resolução adaptativa', gfxFps: 'Mostrar taxa de quadros',
      gfxPostFailed: 'O pós-processamento não está disponível neste dispositivo; o tabuleiro é exibido sem ele.',
      gpuUnknown: 'GPU desconhecida',
      sum_noShadows: 'sem sombras', sum_shadows: 'sombras', sum_ao: 'oclusão ambiente', sum_aoHigh: 'oclusão ambiente completa',
      sum_bloom: 'brilho', sum_reflections: 'reflexos', sum_noAA: 'sem antisserrilhado', sum_particles: 'partículas',
    },
    'it-IT': {
      settings: 'Impostazioni', graphics: 'Grafica', close: 'Chiudi impostazioni',
      gfxQuality: 'Qualità', gfxAuto: 'Automatica (rilevata: {tier})',
      tierLow: 'Bassa', tierBalanced: 'Bilanciata', tierHigh: 'Alta', tierUltra: 'Ultra',
      gfxScale: 'Scala di rendering', gfxFromPreset: 'Dalla qualità ({tier})',
      cat_shadows: 'Ombre', cat_ao: 'Occlusione ambientale', cat_bloom: 'Bagliore', cat_grade: 'Correzione colore',
      cat_antialias: 'Antialiasing', cat_reflections: 'Riflessi', cat_detail: 'Dettaglio del tavolo', cat_particles: 'Pulviscolo fluttuante',
      t_off: 'No', t_on: 'Sì', t_low: 'Basso', t_medium: 'Medio', t_high: 'Alto',
      t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Semplice', t_detailed: 'Dettagliato',
      gfxAdaptive: 'Risoluzione adattiva', gfxFps: 'Mostra frequenza fotogrammi',
      gfxPostFailed: 'La post-elaborazione non è disponibile su questo dispositivo, quindi il tabellone viene mostrato senza.',
      gpuUnknown: 'GPU sconosciuta',
      sum_noShadows: 'senza ombre', sum_shadows: 'ombre', sum_ao: 'occlusione ambientale', sum_aoHigh: 'occlusione ambientale completa',
      sum_bloom: 'bagliore', sum_reflections: 'riflessi', sum_noAA: 'senza antialiasing', sum_particles: 'pulviscolo',
    },
  };
  Object.keys(GFX).forEach(function (tag) { if (STRINGS[tag]) Object.assign(STRINGS[tag], GFX[tag]); });

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
