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

export default pdfMake;
