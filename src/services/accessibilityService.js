import { i18nService } from './i18nService.js';

const BASE_RESOURCES = {
  sports: [
    {
      title: 'Venue Accessibility Checklists',
      url: 'https://www.ada.gov/resources/stadiums/'
    },
    {
      title: 'Accessible Seating + Services (General)',
      url: 'https://www.ada.gov/topics/facilities/'
    }
  ],
  broadway: [
    {
      title: 'Broadway Accessibility Services',
      url: 'https://www.tdf.org/nyc/80/TDF-Accessibility-Program'
    }
  ],
  festival: [
    {
      title: 'Festival Accessibility Planning Guide',
      url: 'https://www.ada.gov/resources/'
    }
  ],
  default: [
    {
      title: 'ADA Resources',
      url: 'https://www.ada.gov/resources/'
    }
  ]
};

function normalizeKind(kind) {
  const value = String(kind || '').toLowerCase();
  if (value.includes('sport')) return 'sports';
  if (value.includes('broadway') || value.includes('theatre') || value.includes('theater')) return 'broadway';
  if (value.includes('festival')) return 'festival';
  return 'default';
}

export const accessibilityService = {
  normalizePreferences(input = {}) {
    return {
      enabled: input.enabled === true,
      read_aloud_format: input.read_aloud_format === 'audio_link' ? 'audio_link' : 'screen_reader_text',
      delivery_mode: input.delivery_mode === 'at_home' ? 'at_home' : 'in_person',
      links_opt_in: input.links_opt_in !== false,
      simplified_copy: input.simplified_copy === true
    };
  },

  getResources({ kind }) {
    const key = normalizeKind(kind);
    return BASE_RESOURCES[key] || BASE_RESOURCES.default;
  },

  buildAccessibleSummary({ event, preferences, language = 'en' }) {
    if (!preferences?.enabled) return '';

    const lines = [];
    const lang = i18nService.normalizeLanguage(language);
    lines.push(`${i18nService.t(lang, 'accessible_summary')}: ${event.title}`);
    lines.push(`${i18nService.t(lang, 'date_time')}: ${event.start_at} to ${event.end_at}`);
    lines.push(`${i18nService.t(lang, 'location')}: ${event.location_name || event.location_address || 'TBD'}`);

    if (preferences.delivery_mode === 'at_home') {
      lines.push(i18nService.t(lang, 'at_home_access'));
    } else {
      lines.push(i18nService.t(lang, 'in_person_access'));
    }

    if (preferences.read_aloud_format === 'audio_link') {
      lines.push(i18nService.t(lang, 'read_aloud_audio'));
    } else {
      lines.push(i18nService.t(lang, 'read_aloud_screen_reader'));
    }

    return lines.join('\n');
  }
};
