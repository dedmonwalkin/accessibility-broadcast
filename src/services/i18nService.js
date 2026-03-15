const MESSAGES = {
  en: {
    location: 'Location',
    starts: 'Starts',
    program: 'Program',
    partners: 'Partners',
    facts: 'Facts',
    facts_default: 'Expanded game/program intelligence is enabled for this tier.',
    accessibility_resources: 'Accessibility resources',
    accessible_summary: 'Accessible Summary',
    date_time: 'Date/time',
    at_home_access: 'At-home access: check broadcaster stream, live captions, and radio simulcast options.',
    in_person_access: 'In-person access: confirm seating, entrance routes, assistive listening devices, and restrooms.',
    read_aloud_audio: 'Read-aloud mode: audio link generation can be connected via external TTS provider.',
    read_aloud_screen_reader: 'Read-aloud mode: screen-reader friendly text included in this message.',
    starts_in: 'Starts in {minutes}m',
    invite_prefix: '[Invite]',
    cancelled_prefix: '[Cancelled]',
    starting_soon_prefix: '[Starting Soon]',
    source: 'Source'
  },
  es: {
    location: 'Ubicacion',
    starts: 'Comienza',
    program: 'Programa',
    partners: 'Socios',
    facts: 'Datos',
    facts_default: 'La inteligencia ampliada del juego/programa esta habilitada para este nivel.',
    accessibility_resources: 'Recursos de accesibilidad',
    accessible_summary: 'Resumen accesible',
    date_time: 'Fecha/hora',
    at_home_access: 'Acceso en casa: revise la transmision, subtitulos en vivo y simulcast de radio.',
    in_person_access: 'Acceso presencial: confirme asientos, rutas de entrada, dispositivos auditivos y banos.',
    read_aloud_audio: 'Modo de lectura en voz alta: se puede conectar un enlace de audio con un proveedor TTS externo.',
    read_aloud_screen_reader: 'Modo de lectura en voz alta: texto compatible con lector de pantalla incluido.',
    starts_in: 'Comienza en {minutes}m',
    invite_prefix: '[Invitacion]',
    cancelled_prefix: '[Cancelado]',
    starting_soon_prefix: '[Comienza pronto]',
    source: 'Fuente'
  },
  fr: {
    location: 'Lieu',
    starts: 'Debut',
    program: 'Programme',
    partners: 'Partenaires',
    facts: 'Faits',
    facts_default: 'Le mode detaille est active pour ce niveau.',
    accessibility_resources: 'Ressources d accessibilite',
    accessible_summary: 'Resume accessible',
    date_time: 'Date/heure',
    at_home_access: 'Acces a domicile: verifiez le flux, les sous-titres en direct et le simulcast radio.',
    in_person_access: 'Acces sur place: confirmez les places, entrees, aides auditives et toilettes.',
    read_aloud_audio: 'Mode lecture audio: un lien audio peut etre connecte via un fournisseur TTS externe.',
    read_aloud_screen_reader: 'Mode lecture audio: texte compatible lecteur d ecran inclus.',
    starts_in: 'Debute dans {minutes}m',
    invite_prefix: '[Invitation]',
    cancelled_prefix: '[Annule]',
    starting_soon_prefix: '[Debut imminent]',
    source: 'Source'
  }
};

function normalizeLanguage(input) {
  const value = String(input || 'en').trim().toLowerCase();
  if (!value) return 'en';
  const base = value.split('-')[0];
  if (MESSAGES[base]) return base;
  return 'en';
}

function format(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

export const i18nService = {
  normalizeLanguage,

  listSupportedLanguages() {
    return Object.keys(MESSAGES);
  },

  t(language, key, vars = {}) {
    const lang = normalizeLanguage(language);
    const dict = MESSAGES[lang] || MESSAGES.en;
    const fallback = MESSAGES.en[key] || key;
    return format(dict[key] || fallback, vars);
  }
};

