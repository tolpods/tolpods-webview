// Wait (briefly) for the site fonts, so text drawn onto 3D screens and signs uses them instead of a fallback.
export const fontsReady = (async () => {
  try {
    if (!document.fonts || !document.fonts.load) return;
    const give = new Promise((r) => setTimeout(r, 1800));          // never block longer than this
    await Promise.race([Promise.all([
      document.fonts.load('700 48px "DM Sans"'), document.fonts.load('400 48px "DM Sans"'),
      document.fonts.load('italic 400 48px "Instrument Serif"'), document.fonts.load('500 24px "DM Mono"'), document.fonts.load('400 24px "IBM Plex Mono"'),
    ]), give]);
  } catch (e) { /* fall back to system fonts */ }
})();
