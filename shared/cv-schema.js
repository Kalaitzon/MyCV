/**
 * CV extraction contract, shared by the local CLI (`scripts/import-cv.mjs`)
 * and the serverless import endpoint (`api/import-cv.js`).
 *
 * Keeping one copy means the two paths can never drift apart and produce
 * differently-shaped cv.json files.
 */

export const PRESERVED_CONTACT_IDS = ["portfolio", "links"];

/** Helper: a {en, el} pair. */
const localized = (description) => ({
  type: "object",
  description,
  properties: {
    en: { type: "string", description: "English text" },
    el: { type: "string", description: "Greek text" },
  },
  required: ["en", "el"],
});

export const CV_SCHEMA = {
  type: "object",
  properties: {
    sourceLanguage: {
      type: "string",
      enum: ["en", "el"],
      description:
        "The language the source CV document is actually written in. Used to file the PDF as the English or the Greek download.",
    },
    person: {
      type: "object",
      properties: {
        firstName: localized("Given name"),
        lastName: localized("Family name"),
        headline: localized("One-line professional headline, e.g. current role or field of study"),
      },
      required: ["firstName", "lastName", "headline"],
    },
    contact: {
      type: "array",
      description: "Contact methods found in the CV: email, phone, LinkedIn, GitHub, personal site.",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Short slug: email, phone, linkedin, github, website",
          },
          label: localized("Display label for this contact method"),
          value: { type: "string", description: "Human-readable value shown on screen" },
          href: {
            type: "string",
            description: "Full href: mailto:…, tel:… (no spaces), or https://…",
          },
        },
        required: ["id", "label", "value", "href"],
      },
    },
    personalInfo: {
      type: "array",
      description:
        "Personal details table: name, surname, date of birth, birth place, nationality, languages, driver's licence, military service. Include only what the CV actually states.",
      items: {
        type: "object",
        properties: { label: localized("Field name"), value: localized("Field value") },
        required: ["label", "value"],
      },
    },
    summary: localized("The professional summary / profile paragraph"),
    education: {
      type: "array",
      description: "Degrees, most recent first.",
      items: {
        type: "object",
        properties: {
          degree: localized("Degree title, e.g. 'MSc, Cybersecurity'"),
          institution: localized("University or school name"),
          period: localized("Dates or expected graduation, e.g. 'Graduated July 2025'"),
          highlights: {
            type: "array",
            description: "Thesis, honours, rank, exchanges, certifications tied to this degree.",
            items: localized("One highlight"),
          },
        },
        required: ["degree", "institution", "period", "highlights"],
      },
    },
    skills: {
      type: "array",
      description: "Skill groups such as Programming, Security Tools, Frameworks, Operating Systems, Languages.",
      items: {
        type: "object",
        properties: {
          label: localized("Group name"),
          items: {
            type: "array",
            description:
              "Individual skills. Keep proper nouns (Python, Wireshark) untranslated and identical in both languages.",
            items: { type: "string" },
          },
        },
        required: ["label", "items"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: localized("Certification name"),
          issuer: localized("Issuing body and date or status"),
        },
        required: ["name", "issuer"],
      },
    },
    experience: {
      type: "array",
      description: "Professional and military experience, most recent first.",
      items: {
        type: "object",
        properties: {
          role: localized("Job title"),
          organization: localized("Employer name"),
          location: localized("City, country"),
          period: localized("Date range, e.g. 'Jan 2026 – May 2026'"),
          bullets: { type: "array", items: localized("One responsibility or achievement") },
        },
        required: ["role", "organization", "location", "period", "bullets"],
      },
    },
    projects: {
      type: "array",
      description: "Project groups, e.g. academic projects per degree.",
      items: {
        type: "object",
        properties: {
          title: localized("Group title"),
          period: localized("Date range"),
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: localized("Project name"),
                description: localized("What was built or done"),
              },
              required: ["name", "description"],
            },
          },
        },
        required: ["title", "period", "items"],
      },
    },
    activities: {
      type: "array",
      description: "Volunteering, societies, extracurricular activities.",
      items: {
        type: "object",
        properties: {
          title: localized("Activity name"),
          description: localized("What it involves"),
        },
        required: ["title", "description"],
      },
    },
  },
  required: [
    "sourceLanguage",
    "person",
    "contact",
    "personalInfo",
    "summary",
    "education",
    "skills",
    "certifications",
    "experience",
    "projects",
    "activities",
  ],
};

export const SYSTEM_PROMPT = `You extract CVs into structured bilingual data for a personal website.

Rules:
- Produce BOTH English and Greek for every localized field. The source CV is written in one language; translate faithfully into the other. Never leave a field empty and never copy the English text into the Greek slot (or vice versa) as a placeholder.
- Greek translations must read naturally to a native speaker, not word-for-word. Keep technical terms, tool names, company names, university names and certification titles in their original form (e.g. "Metasploit", "Netcompany", "CompTIA Security+"). Job titles and descriptions SHOULD be translated.
- Preserve the CV's own ordering and wording. Do not invent, embellish, summarise away detail, or add achievements that are not stated.
- Dates: keep the format used in the CV. Abbreviate Greek months (Ιαν, Φεβ, Μάρ, Απρ, Μάι, Ιούν, Ιούλ, Αύγ, Σεπ, Οκτ, Νοε, Δεκ) when the English uses abbreviations.
- For phone hrefs strip all spaces and keep the country code (tel:+306936736484).
- If a section is absent from the CV, return an empty array for it rather than inventing content.`;


/**
 * Contact links to drop before publishing.
 *
 * A phone number on a public page invites cold calls and scraping, and the
 * email is enough to reach anyone. Change this if you want yours shown.
 */
const EXCLUDED_CONTACT_PREFIXES = ["tel:"];

/** Compare hrefs ignoring case and a trailing slash. */
function normaliseHref(href) {
  return String(href).trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Merge a freshly parsed contact list with entries a CV document cannot
 * contain (portfolio site, link aggregators), so an import never drops them.
 *
 * The model often reports the same destination twice under different labels
 * ("Portfolio" and "MSc Portfolio"), so entries are also deduplicated by
 * destination — the first occurrence wins.
 */
export function mergeContacts(parsed, previous) {
  const preserved = previous.filter((c) => PRESERVED_CONTACT_IDS.includes(c.id));
  const parsedIds = new Set(parsed.map((c) => c.id));
  const combined = [...parsed, ...preserved.filter((c) => !parsedIds.has(c.id))];

  const seen = new Set();
  return combined.filter((contact) => {
    if (!contact?.href) return false;
    if (EXCLUDED_CONTACT_PREFIXES.some((prefix) => contact.href.startsWith(prefix))) return false;
    const key = normaliseHref(contact.href);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Assemble the final cv.json payload from a tool-use result.
 * `previous` is the existing cv.json (or {}) so preserved fields survive.
 */
export function buildCvJson(parsed, previous, sourceName, suppliedLanguages = []) {
  const sourceLanguage = parsed.sourceLanguage === "el" ? "el" : "en";

  /*
   * Which languages the site can actually offer.
   *
   * One document in means one language out: the visitor gets that language
   * only, and the language switcher disappears rather than showing a
   * machine-translated copy the author never approved. Two documents in means
   * both, each in the author's own words.
   */
  const languages = suppliedLanguages.filter((lang) => lang === "en" || lang === "el");
  const availableLanguages = languages.length ? [...new Set(languages)] : [sourceLanguage];

  return {
    data: {
      meta: {
        generatedAt: new Date().toISOString(),
        source: sourceName,
        sourceLanguage,
        availableLanguages,
      },
      person: parsed.person,
      contact: mergeContacts(parsed.contact ?? [], previous.contact ?? []),
      personalInfo: parsed.personalInfo ?? [],
      summary: parsed.summary,
      education: parsed.education ?? [],
      skills: parsed.skills ?? [],
      certifications: parsed.certifications ?? [],
      experience: parsed.experience ?? [],
      projects: parsed.projects ?? [],
      activities: parsed.activities ?? [],
    },
    sourceLanguage,
    availableLanguages,
  };
}

/** Warn about localized pairs whose Greek side looks untranslated. */
export function findUntranslated(node, path = "", problems = []) {
  if (node && typeof node === "object") {
    if (typeof node.en === "string" && typeof node.el === "string") {
      const hasGreek = /[\u0370-\u03ff\u1f00-\u1fff]/.test(node.el);
      if (!hasGreek && node.el === node.en && node.en.split(/\s+/).length > 3) {
        problems.push(`${path}: Greek text looks untranslated ("${node.en.slice(0, 50)}...")`);
      }
      return problems;
    }
    for (const [key, value] of Object.entries(node)) {
      findUntranslated(value, path ? `${path}.${key}` : key, problems);
    }
  }
  return problems;
}
