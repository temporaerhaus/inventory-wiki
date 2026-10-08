import pdfMake from 'pdfmake/build/pdfmake';

// fonts are served from public/fonts, next to the bundle (or by the vite dev server)
const scriptUrl = import.meta.url;
const fontBaseUrl = import.meta.env.DEV ? new URL('/fonts/', location.href) : new URL('fonts/', scriptUrl);

// there are no italic files, italics fall back to the upright ones instead of
// failing the whole document ("Font 'Roboto' in style 'italics' is not defined")
pdfMake.fonts = {
   Roboto: {
     bold: new URL('RobotoMono-Bold.ttf', fontBaseUrl).href,
     normal: new URL('RobotoMono-Regular.ttf', fontBaseUrl).href,
     italics: new URL('RobotoMono-Regular.ttf', fontBaseUrl).href,
     bolditalics: new URL('RobotoMono-Bold.ttf', fontBaseUrl).href,
   },
};

export const mm2pt = (mm) => mm / 25.4 * 72;

// The same font files for the preview of a label as for its pdf: the Roboto
// Mono of the page (from Google Fonts) has other vertical metrics, which
// shifts the lines of the preview against those of the pdf.
export const LABEL_FONT = 'invwiki-label-mono';
let labelFonts = null;
export function loadLabelFonts() {
  labelFonts ??= Promise.all([['normal', pdfMake.fonts.Roboto.normal], ['bold', pdfMake.fonts.Roboto.bold]].map(
    ([weight, url]) => new FontFace(LABEL_FONT, `url(${url})`, { weight }).load().then(font => document.fonts.add(font))
  )).catch(() => {
    // the preview falls back to the page's Roboto Mono
  });
  return labelFonts;
}

export default pdfMake;
