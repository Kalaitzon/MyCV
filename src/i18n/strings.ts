/**
 * UI chrome strings (window titles, buttons, taskbar, dialogs).
 * CV content itself lives in `src/data/cv.ts`.
 */

import type { Localized } from "../data/cv";

export const UI = {
  // Window / icon titles
  personalInfo: { en: "Personal Info", el: "Προσωπικά Στοιχεία" },
  about: { en: "About Me", el: "Σχετικά με Εμένα" },
  education: { en: "Education", el: "Εκπαίδευση" },
  skills: { en: "Skills", el: "Δεξιότητες" },
  experience: { en: "Experience", el: "Εμπειρία" },
  projects: { en: "Projects", el: "Projects" },
  activities: { en: "Activities", el: "Δραστηριότητες" },
  contact: { en: "Contact", el: "Επικοινωνία" },
  portfolio: { en: "MSc Portfolio", el: "Πορτφόλιο MSc" },
  resume: { en: "Resume (PDF)", el: "Βιογραφικό (PDF)" },
  settings: { en: "Display Properties", el: "Ιδιότητες Εμφάνισης" },
  admin: { en: "Update CV", el: "Ενημέρωση CV" },

  // Admin window
  adminIntro: {
    en: "Upload your CV (PDF or Word). It is read by AI and published to the live site in both languages.",
    el: "Ανέβασε το βιογραφικό σου (PDF ή Word). Διαβάζεται από AI και δημοσιεύεται στο live site και στις δύο γλώσσες.",
  },
  adminPassword: { en: "Password", el: "Κωδικός" },
  adminFileEn: { en: "English CV", el: "Αγγλικό βιογραφικό" },
  adminFileEl: { en: "Greek CV", el: "Ελληνικό βιογραφικό" },
  adminBothBetter: {
    en: "Tip: give both versions. The model then matches them instead of translating, so your own wording is kept in both languages.",
    el: "Συμβουλή: δώσε και τις δύο εκδόσεις. Τότε το μοντέλο τις αντιστοιχίζει αντί να μεταφράζει, οπότε διατηρείται η δική σου διατύπωση και στις δύο γλώσσες.",
  },
  adminBothGood: {
    en: "Both versions supplied — nothing will be machine-translated.",
    el: "Δόθηκαν και οι δύο εκδόσεις — τίποτα δεν θα μεταφραστεί αυτόματα.",
  },
  adminSubmit: { en: "Upload and publish", el: "Ανέβασμα και δημοσίευση" },
  adminWorking: { en: "Working…", el: "Επεξεργασία…" },
  adminPatience: {
    en: "Reading the document. This takes 30–60 seconds — keep the window open.",
    el: "Διαβάζω το έγγραφο. Παίρνει 30–60 δευτερόλεπτα — μην κλείσεις το παράθυρο.",
  },
  adminDone: { en: "Published.", el: "Δημοσιεύτηκε." },
  adminFailed: { en: "Failed", el: "Απέτυχε" },
  adminPdfSaved: { en: "PDF downloads updated", el: "Ενημερώθηκαν τα PDF προς λήψη" },
  adminRedeploy: {
    en: "The site rebuilds automatically. Refresh in about a minute to see the change.",
    el: "Το site ξαναχτίζεται αυτόματα. Κάνε ανανέωση σε περίπου ένα λεπτό για να δεις την αλλαγή.",
  },
  adminTooLarge: {
    en: "The files total more than 3 MB. Compress the PDFs and try again.",
    el: "Τα αρχεία ξεπερνούν συνολικά τα 3 MB. Συμπίεσε τα PDF και δοκίμασε ξανά.",
  },
  adminNoBackend: {
    en: "The import service is not reachable here. It only runs on the Vercel deployment.",
    el: "Η υπηρεσία εισαγωγής δεν είναι διαθέσιμη εδώ. Λειτουργεί μόνο στο deployment του Vercel.",
  },

  // Taskbar / start menu
  start: { en: "start", el: "έναρξη" },
  allWindows: { en: "Open windows", el: "Ανοιχτά παράθυρα" },
  closeAll: { en: "Close all windows", el: "Κλείσιμο όλων" },
  language: { en: "Language", el: "Γλώσσα" },
  theme: { en: "Theme", el: "Θέμα" },

  // Window controls (accessible labels)
  minimize: { en: "Minimize", el: "Ελαχιστοποίηση" },
  maximize: { en: "Maximize", el: "Μεγιστοποίηση" },
  restore: { en: "Restore", el: "Επαναφορά" },
  close: { en: "Close", el: "Κλείσιμο" },

  // Boot screen
  booting: { en: "Starting up…", el: "Εκκίνηση…" },
  welcome: { en: "welcome", el: "καλώς ήρθατε" },
  clickToEnter: { en: "Click to log on", el: "Κάντε κλικ για είσοδο" },

  // Misc
  certifications: { en: "Certifications", el: "Πιστοποιήσεις" },
  summary: { en: "Summary", el: "Περίληψη" },
  downloadCvEn: { en: "Open CV — English (PDF)", el: "Άνοιγμα CV — Αγγλικά (PDF)" },
  downloadCvEl: { en: "Open CV — Greek (PDF)", el: "Άνοιγμα Βιογραφικού — Ελληνικά (PDF)" },
  openCvHint: {
    en: "Opens the full CV in a new tab.",
    el: "Ανοίγει το πλήρες βιογραφικό σε νέα καρτέλα.",
  },
  resumeLangNote: {
    en: "The CV is available in English and Greek. The button gives you the version matching the interface language — switch the language to get the other one.",
    el: "Το βιογραφικό είναι διαθέσιμο στα Ελληνικά και στα Αγγλικά. Το κουμπί σού δίνει την έκδοση που ταιριάζει με τη γλώσσα του site — άλλαξε γλώσσα για την άλλη έκδοση.",
  },
  copyright: {
    en: "Developed by Ioannis Kalaitzidis — All rights reserved",
    el: "Αναπτύχθηκε από τον Ιωάννη Καλαϊτζίδη — Με επιφύλαξη παντός δικαιώματος",
  },
  desktopHint: {
    en: "Double-click an icon to open a window.",
    el: "Διπλό κλικ σε ένα εικονίδιο για να ανοίξει ένα παράθυρο.",
  },
  tipTitle: { en: "Tip", el: "Συμβουλή" },
  portfolioBlurb: {
    en: "A separate site collecting the coursework, labs and write-ups from my MSc in Cybersecurity and Artificial Intelligence.",
    el: "Ξεχωριστό site που συγκεντρώνει τις εργασίες, τα εργαστήρια και τις αναφορές από το μεταπτυχιακό μου στην Κυβερνοασφάλεια και την Τεχνητή Νοημοσύνη.",
  },
  openPortfolio: { en: "Open portfolio", el: "Άνοιγμα πορτφόλιο" },
  lastUpdated: { en: "CV last updated", el: "Τελευταία ενημέρωση βιογραφικού" },
} satisfies Record<string, Localized>;

export type UiKey = keyof typeof UI;
