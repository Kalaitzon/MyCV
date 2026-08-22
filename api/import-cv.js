/**
 * POST /api/import-cv — password-protected CV import.
 *
 * Flow:
 *   browser sends { password, files: [{ filename, base64, lang }] }
 *     -> one file per language; supplying both avoids machine translation
 *     -> password is checked in constant time against ADMIN_PASSWORD
 *     -> the document goes to Gemini or Claude for structured extraction
 *     -> the result is committed to GitHub as src/data/cv.json
 *     -> Vercel sees the commit and redeploys, so every visitor gets it
 *
 * Nothing secret ever reaches the browser: the AI key, the GitHub
 * token and the password all live in Vercel environment variables and are
 * only read here, on the server.
 *
 * Required environment variables (Vercel -> Settings -> Environment Variables):
 *   GEMINI_API_KEY      Google AI Studio key (free tier available)
 *                       -- or --
 *   ANTHROPIC_API_KEY   Anthropic key (paid)
 *   ADMIN_PASSWORD      the password you will type in the site
 *   GITHUB_TOKEN        fine-grained token with Contents: Read and write
 *   GITHUB_REPO         e.g. Kalaitzon/MyCV
 * Optional:
 *   GITHUB_BRANCH       defaults to "main"
 *   CV_PROVIDER         "gemini" or "anthropic"; otherwise inferred from keys
 *   CV_MODEL            defaults to the provider's standard model
 */

import { timingSafeEqual } from "node:crypto";
import { buildCvJson, findUntranslated } from "../shared/cv-schema.js";
import { describeProviderError, extractCv, pickProvider, readDocument } from "../shared/providers.js";

export const config = {
  // Extraction of a full bilingual CV typically takes 25-50 seconds.
  maxDuration: 60,
};

const CV_JSON_PATH = "src/data/cv.json";
const PDF_PATHS = { en: "public/CV_EN.pdf", el: "public/CV_EL.pdf" };
/** Vercel caps request bodies at ~4.5 MB; base64 inflates by a third. */
const MAX_FILE_BYTES = 3 * 1024 * 1024;

/**
 * Per-instance brute-force guard. Serverless instances are short-lived, so
 * this is a speed bump rather than a wall — the constant-time compare and the
 * fixed delay below are what actually make guessing impractical.
 */
const failures = new Map();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded || "").split(",")[0].trim() || "unknown";
}

/** Compare two strings without leaking their contents through timing. */
function passwordMatches(supplied, expected) {
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(String(expected));
  // timingSafeEqual throws on length mismatch, so equalise first.
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------ GitHub

const githubHeaders = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "cv-site-importer",
});

const repoUrl = (path) =>
  `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`;

/** Current blob SHA for a file, or null when the file does not exist yet. */
async function fileSha(path, branch) {
  const response = await fetch(`${repoUrl(path)}?ref=${branch}`, { headers: githubHeaders() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}) for ${path}`);
  const body = await response.json();
  return body.sha;
}

/** Read and parse the committed cv.json so preserved fields survive. */
async function readCvJson(branch) {
  const response = await fetch(`${repoUrl(CV_JSON_PATH)}?ref=${branch}`, { headers: githubHeaders() });
  if (!response.ok) return {};
  const body = await response.json();
  try {
    return JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

async function commitFile(path, contentBase64, message, branch) {
  const sha = await fileSha(path, branch);
  const response = await fetch(repoUrl(path), {
    method: "PUT",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: contentBase64, branch, ...(sha ? { sha } : {}) }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub write failed (${response.status}) for ${path}: ${detail.slice(0, 200)}`);
  }
}

// -------------------------------------------------------------- extraction

// ------------------------------------------------------------------ handler

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const missing = ["ADMIN_PASSWORD", "GITHUB_TOKEN", "GITHUB_REPO"].filter(
    (name) => !process.env[name],
  );
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    missing.push("GEMINI_API_KEY or ANTHROPIC_API_KEY");
  }
  if (missing.length) {
    return res.status(500).json({
      error: `The server is not configured yet. Missing environment variables: ${missing.join(", ")}.`,
    });
  }

  const ip = clientIp(req);
  const record = failures.get(ip);
  if (record && record.count >= MAX_FAILURES && Date.now() - record.at < LOCKOUT_MS) {
    return res.status(429).json({ error: "Too many failed attempts. Try again in 15 minutes." });
  }

  const { password, files, filename, fileBase64 } = req.body ?? {};

  if (!passwordMatches(password ?? "", process.env.ADMIN_PASSWORD)) {
    // A fixed delay makes online guessing slow regardless of instance reuse.
    await sleep(700);
    const next = record && Date.now() - record.at < LOCKOUT_MS ? record.count + 1 : 1;
    failures.set(ip, { count: next, at: Date.now() });
    return res.status(401).json({ error: "Wrong password." });
  }
  failures.delete(ip);

  // Accept the multi-file shape, and the older single-file shape for safety.
  const uploads = Array.isArray(files) && files.length
    ? files
    : filename && fileBase64
      ? [{ filename, base64: fileBase64, lang: null }]
      : [];

  if (!uploads.length) return res.status(400).json({ error: "No file received." });
  if (uploads.length > 2) return res.status(400).json({ error: "At most two files (one per language)." });

  let total = 0;
  for (const upload of uploads) {
    if (!upload?.filename || !upload?.base64) {
      return res.status(400).json({ error: "A file was sent without a name or contents." });
    }
    upload.buffer = Buffer.from(upload.base64, "base64");
    if (upload.buffer.byteLength === 0) {
      return res.status(400).json({ error: `"${upload.filename}" is empty.` });
    }
    total += upload.buffer.byteLength;
  }
  if (total > MAX_FILE_BYTES) {
    return res.status(413).json({
      error: `The files total ${(total / 1e6).toFixed(1)} MB. The limit is 3 MB.`,
    });
  }

  const branch = process.env.GITHUB_BRANCH || "main";
  let chosen;
  try {
    chosen = pickProvider();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  try {
    const documents = [];
    for (const upload of uploads) {
      documents.push({ lang: upload.lang ?? null, doc: await readDocument(upload.filename, upload.buffer) });
    }
    // Two attempts only: the function has a 60-second budget and a long
    // backoff would time out before the retry could finish.
    const { parsed, usage, provider, model } = await extractCv({ documents, attempts: 2 });
    const previous = await readCvJson(branch);
    const names = uploads.map((upload) => upload.filename).join(" + ");
    const { data, sourceLanguage, availableLanguages } = buildCvJson(
      parsed,
      previous,
      names,
      uploads.map((upload) => upload.lang).filter(Boolean),
    );

    const commitMessage = `Update CV from ${names}`;
    await commitFile(
      CV_JSON_PATH,
      Buffer.from(JSON.stringify(data, null, 2) + "\n").toString("base64"),
      commitMessage,
      branch,
    );

    // Keep the downloads in sync. With two labelled uploads each PDF goes to
    // its own language slot; with one, the language the model detected decides.
    const pdfCommitted = [];
    for (const upload of uploads) {
      if (!upload.filename.toLowerCase().endsWith(".pdf")) continue;
      const target = PDF_PATHS[upload.lang ?? sourceLanguage];
      await commitFile(target, upload.base64, `${commitMessage} (PDF)`, branch);
      pdfCommitted.push(target);
    }

    return res.status(200).json({
      ok: true,
      sourceLanguage,
      availableLanguages,
      pdfCommitted,
      counts: {
        education: data.education.length,
        experience: data.experience.length,
        skills: data.skills.length,
        projects: data.projects.length,
        certifications: data.certifications.length,
        activities: data.activities.length,
      },
      warnings: findUntranslated(data).slice(0, 5),
      provider,
      model,
      usage,
    });
  } catch (error) {
    // Caller mistakes (wrong file type, unreadable document) are 4xx, not 5xx.
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    const message = describeProviderError(error, chosen.provider, process.env.CV_MODEL ?? "");
    const status = error?.status === 429 ? 429 : 500;
    return res.status(status).json({ error: message });
  }
}
