// Shared by the viewer and embed. Late originals must not overwrite translations.
export function createCaptionBuffer(limit = 500) {
  const rows = new Map();
  const rank = { pending: 0, original: 1, unavailable: 2, mock: 3, translated: 4 };
  function values() {
    return [...rows.values()].sort((a, b) => (Date.parse(a.start) || 0) - (Date.parse(b.start) || 0));
  }
  return {
    upsert(segment) {
      if (!segment || !segment.id) return;
      const previous = rows.get(segment.id);
      if (previous && previous.target_language === segment.target_language &&
          (rank[previous.translation_status] || 0) > (rank[segment.translation_status] || 0)) return;
      rows.set(segment.id, { ...segment });
      if (rows.size > limit) rows.delete(values()[0].id);
    },
    values,
    text() {
      return values().map(segment => {
        const suffix = segment.translation_status === 'pending' ? ' (translation pending; original)' :
          segment.translation_status === 'unavailable' ? ' (translation unavailable; original)' :
          segment.translation_status === 'mock' ? ' (mock translation)' : '';
        return '[' + segment.start + '] ' + segment.text + suffix;
      }).join('\n');
    }
  };
}
