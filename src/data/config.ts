/**
 * Small site-wide constants.
 *
 * `RESUME_FILES` holds one PDF per language, resolved against Vite's BASE_URL
 * so the links keep working under a GitHub Pages sub-path (e.g. /MyCV/) as
 * well as at a domain root. Put the two PDFs at `public/CV_EN.pdf` and
 * `public/CV_EL.pdf`; `npm run import-cv` files them there automatically based
 * on the language it detects in the document you feed it.
 */

export const RESUME_FILES: Record<"en" | "el", string> = {
  en: `${import.meta.env.BASE_URL}CV_EN.pdf`,
  el: `${import.meta.env.BASE_URL}CV_EL.pdf`,
};

/** Shown in the browser tab and in the boot screen. */
export const SITE_TITLE = "Ioannis Kalaitzidis — Digital CV";

/** Companion site holding the MSc coursework and lab write-ups. */
export const PORTFOLIO_URL = "https://msc-portfolio-theta.vercel.app/";
