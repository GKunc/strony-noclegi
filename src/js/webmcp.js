// WebMCP: expose safe, read-only-ish page tools to in-browser AI agents.
// The API is still experimental and its name changed between Chrome versions
// (navigator.modelContext -> document.modelContext). Verify against current
// Chrome docs before relying on it. Always feature-detect.
(() => {
  const ctx = document.modelContext || navigator.modelContext;
  if (!ctx || typeof ctx.registerTool !== 'function') return;

  const text = (t) => ({ content: [{ type: 'text', text: t }] });

  try {
    ctx.registerTool({
      name: 'get_page_summary',
      description: 'Returns the page title, main headline and primary call to action.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => text(JSON.stringify({
        title: document.title,
        headline: document.querySelector('h1')?.textContent.trim(),
        cta: document.querySelector('.hero .btn')?.textContent.trim(),
      })),
    });

    ctx.registerTool({
      name: 'scroll_to_section',
      description: 'Scrolls the page to a section by id (problem, rozwiazanie, jak-to-dziala, dla-kogo, cennik, poradnik, faq, kontakt).',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', enum: ['problem', 'rozwiazanie', 'jak-to-dziala', 'dla-kogo', 'cennik', 'poradnik', 'faq', 'kontakt'] } },
        required: ['id'],
      },
      execute: async ({ id }) => {
        const el = document.getElementById(id);
        if (!el) return text('Section not found');
        el.scrollIntoView({ behavior: 'smooth' });
        return text('Scrolled to ' + id);
      },
    });
  } catch (err) {
    console.warn('WebMCP registration failed', err);
  }
})();
