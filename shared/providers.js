/**
 * AI provider layer.
 *
 * The CV extraction works with either Anthropic (Claude) or Google (Gemini).
 * Both are asked for the same structured shape defined in `cv-schema.js`, so
 * the rest of the code never needs to know which one produced the result.
 *
 * Which one runs is decided by `pickProvider()`:
 *   CV_PROVIDER=gemini | anthropic   explicit choice, wins if set
 *   otherwise whichever API key is present (Gemini first, since it is free)
 *
 * Gemini has a free tier, which is why it is preferred when both keys exist.
 * Note that Google states free-tier content may be used to improve its
 * products; use Anthropic, or Gemini's paid tier, if that matters for the
 * documents you upload.
 */

import { CV_SCHEMA, SYSTEM_PROMPT } from "./cv-schema.js";

/**
 * Default models.
 *
 * The Gemini default is the "-latest" alias rather than a pinned version:
 * Google keeps retired versions visible in the models list long after they
 * stop answering generateContent, so a pinned name silently rots. The alias
 * always resolves to the current Flash model.
 *
 * Flash rather than Pro is deliberate. This is structured extraction, not
 * reasoning: Flash is as accurate here, several times faster (which matters
 * against the 60-second serverless limit) and far more generous on the free
 * tier. Override with CV_MODEL if you want to compare.
 */
export const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-flash-latest",
};

/**
 * Models to fall back to when the preferred one stays busy.
 *
 * Gemini's free tier is served at lower priority, so a popular model can
 * return 503 for minutes at a time while a less popular one answers
 * immediately. Trying the next model is far more likely to succeed than
 * waiting longer on the first.
 *
 * Ordered by how close each is to the preferred choice.
 */
export const FALLBACK_MODELS = {
  // Measured, not guessed: the "-latest" aliases carry the most traffic and
  // are the first to return 503, while the explicitly versioned Flash models
  // stayed available through the same congestion. So the alias is tried first
  // (it tracks the newest model) but the versioned ones are the safety net.
  gemini: [
    "gemini-flash-latest",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-lite-latest",
    "gemini-pro-latest",
  ],
  anthropic: [],
};

const LANGUAGE_NAMES = { en: "ENGLISH", el: "GREEK" };

/**
 * Build the closing instruction.
 *
 * With one document the model must translate into the other language. With
 * two, it must NOT translate: each language's text is taken from that
 * language's own document, preserving the author's own wording.
 */
function buildInstruction(documents) {
  if (documents.length > 1) {
    return (
      "You have been given the SAME CV in two languages, labelled above.\n" +
      "Do NOT translate anything. For every localized field, take the English " +
      "text from the ENGLISH document and the Greek text from the GREEK " +
      "document, matching the entries to each other. Keep the author's exact " +
      "wording in both languages. If one document contains an entry the other " +
      "omits, translate only that entry and keep everything else verbatim."
    );
  }
  /*
   * One document: the site will offer that language only, so there is nothing
   * to translate. The schema still has both slots, so fill them with the same
   * text — the UI hides the language switcher and shows the author's own
   * words rather than a translation nobody approved.
   */
  const only = documents[0]?.lang;
  if (only) {
    return (
      `This CV is in ${LANGUAGE_NAMES[only]} and will be published in ` +
      `${LANGUAGE_NAMES[only]} only.\n` +
      "Do NOT translate. For every localized field put the SAME text, exactly " +
      "as written in the document, in both the `en` and the `el` slot."
    );
  }

  return (
    "Extract this CV. Detect its language and report it in sourceLanguage.\n" +
    "Do NOT translate: for every localized field put the SAME text, exactly as " +
    "written in the document, in both the `en` and the `el` slot."
  );
}

/** An error caused by the caller's input rather than by the server. */
export function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

/**
 * Normalise an uploaded file into a provider-neutral document.
 * Returns either { kind: "pdf", base64 } or { kind: "text", text }.
 */
export async function readDocument(filename, buffer) {
  const extension = filename.toLowerCase().slice(filename.lastIndexOf("."));

  if (extension === ".pdf") {
    // Both providers read PDFs natively, which preserves layout cues.
    return { kind: "pdf", base64: buffer.toString("base64") };
  }

  if (extension === ".docx") {
    const { default: mammoth } = await import("mammoth");
    let text;
    try {
      ({ value: text } = await mammoth.extractRawText({ buffer }));
    } catch {
      // A .docx is a zip; a corrupt or mislabelled file fails here with an
      // unhelpful zip error. Report it as the caller's problem instead.
      throw badRequest(`"${filename}" is not a readable Word file. Try saving it again, or export a PDF.`);
    }
    if (!text.trim()) throw badRequest(`No text could be extracted from "${filename}".`);
    return { kind: "text", text };
  }

  if (extension === ".txt" || extension === ".md") {
    return { kind: "text", text: buffer.toString("utf8") };
  }

  throw badRequest(`Unsupported file type "${extension}". Use .pdf, .docx, .txt or .md.`);
}

/** Decide which provider to use from the environment. */
export function pickProvider(env = process.env) {
  const explicit = (env.CV_PROVIDER || "").toLowerCase();
  if (explicit === "gemini" || explicit === "anthropic") {
    const key = explicit === "gemini" ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        `CV_PROVIDER is set to "${explicit}" but ${
          explicit === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"
        } is missing.`,
      );
    }
    return { provider: explicit, apiKey: key };
  }

  // Gemini first: it has a free tier, so it is the friendlier default.
  if (env.GEMINI_API_KEY) return { provider: "gemini", apiKey: env.GEMINI_API_KEY };
  if (env.ANTHROPIC_API_KEY) return { provider: "anthropic", apiKey: env.ANTHROPIC_API_KEY };

  throw new Error(
    "No AI key found. Set GEMINI_API_KEY (free, https://aistudio.google.com/apikey) " +
      "or ANTHROPIC_API_KEY (paid, https://console.anthropic.com).",
  );
}

// ----------------------------------------------------------------- Anthropic

async function extractWithAnthropic({ apiKey, model, documents }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const blocks = [];
  for (const entry of documents) {
    if (entry.lang) blocks.push({ type: "text", text: `=== ${LANGUAGE_NAMES[entry.lang]} VERSION ===` });
    blocks.push(
      entry.doc.kind === "pdf"
        ? {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: entry.doc.base64 },
          }
        : { type: "text", text: entry.doc.text },
    );
  }

  // Streaming keeps the connection active through a long extraction.
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "save_cv",
        description: "Save the extracted CV in structured bilingual form.",
        input_schema: CV_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "save_cv" },
    messages: [
      { role: "user", content: [...blocks, { type: "text", text: buildInstruction(documents) }] },
    ],
  });

  const message = await stream.finalMessage();
  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("The model did not return structured data. Try again.");

  return { parsed: toolUse.input, usage: message.usage ?? null };
}

// -------------------------------------------------------------------- Gemini

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Statuses worth retrying: transient congestion and rate limiting.
 * 503 in particular is common on the Gemini free tier, which is served at a
 * lower priority than paid traffic — it means "busy", not "broken".
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Retry with exponential backoff and jitter.
 *
 * Jitter matters: without it, every client that failed at the same moment
 * retries at the same moment and the congestion repeats.
 */
async function withRetry(run, { attempts, onRetry }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const isLast = attempt === attempts;
      if (isLast || !RETRYABLE_STATUSES.has(error.status)) throw error;
      const waitMs = Math.round(2000 * 2 ** (attempt - 1) + Math.random() * 500);
      onRetry?.({ attempt, attempts, waitMs, status: error.status });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

async function callGemini({ apiKey, model, parts, useSchema }) {
  const generationConfig = {
    responseMimeType: "application/json",
    maxOutputTokens: 16000,
    ...(useSchema ? { responseSchema: CV_SCHEMA } : {}),
  };

  const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts }],
      generationConfig,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(detail.slice(0, 400));
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function extractWithGemini({ apiKey, model, documents, attempts, onRetry }) {
  const parts = [];
  for (const entry of documents) {
    if (entry.lang) parts.push({ text: `=== ${LANGUAGE_NAMES[entry.lang]} VERSION ===` });
    parts.push(
      entry.doc.kind === "pdf"
        ? { inline_data: { mime_type: "application/pdf", data: entry.doc.base64 } }
        : { text: entry.doc.text },
    );
  }
  parts.push({ text: buildInstruction(documents) });

  const call = (useSchema) =>
    withRetry(() => callGemini({ apiKey, model, parts, useSchema }), { attempts, onRetry });

  let body;
  try {
    body = await call(true);
  } catch (error) {
    // Gemini supports only a subset of JSON Schema and rejects schemas it
    // considers too large or deeply nested. When that happens, retry in plain
    // JSON mode — the system prompt already describes the shape, and the
    // result is validated by the caller either way.
    if (error.status === 400) {
      body = await call(false);
    } else {
      throw error;
    }
  }

  const candidate = body.candidates?.[0];
  if (!candidate) {
    const blocked = body.promptFeedback?.blockReason;
    throw new Error(blocked ? `Gemini refused the request (${blocked}).` : "Gemini returned no result.");
  }
  if (candidate.finishReason === "MAX_TOKENS") {
    throw new Error("The CV was too long for one response. Try a shorter document.");
  }

  const text = (candidate.content?.parts ?? []).map((part) => part.text ?? "").join("");
  if (!text.trim()) throw new Error("Gemini returned an empty response.");

  try {
    return { parsed: JSON.parse(text), usage: body.usageMetadata ?? null };
  } catch {
    // Some responses wrap the JSON in a ```json fence despite the MIME type.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return { parsed: JSON.parse(fenced[1]), usage: body.usageMetadata ?? null };
    throw new Error("Gemini did not return valid JSON. Try running the import again.");
  }
}

// ------------------------------------------------------------------ dispatch

const REQUIRED_KEYS = ["person", "summary", "education", "experience", "skills"];

/**
 * Run the extraction with whichever provider is configured.
 *
 * `attempts` bounds the retries on transient failures. The command line can
 * afford several; the serverless endpoint has a 60-second budget, so it passes
 * a smaller number.
 *
 * `documents` is an array of { lang: "en" | "el" | null, doc } — one entry per
 * uploaded file. Supplying both language versions of the same CV gives much
 * better results than supplying one and asking for a translation.
 *
 * Returns { parsed, usage, provider, model }.
 */
export async function extractCv({
  documents,
  env = process.env,
  attempts = 4,
  onRetry,
  onModelSwitch,
}) {
  if (!documents?.length) throw badRequest("No document to read.");
  const { provider, apiKey } = pickProvider(env);

  // Preferred model first, then the fallbacks, with duplicates removed.
  const preferred = env.CV_MODEL || DEFAULT_MODELS[provider];
  const candidates = [...new Set([preferred, ...(FALLBACK_MODELS[provider] ?? [])])];

  // The Anthropic SDK retries internally, so only the Gemini path needs this.
  const run = provider === "gemini" ? extractWithGemini : extractWithAnthropic;

  let parsed;
  let usage;
  let model;
  let lastError;

  for (const [index, candidate] of candidates.entries()) {
    try {
      ({ parsed, usage } = await run({ apiKey, model: candidate, documents, attempts, onRetry }));
      model = candidate;
      break;
    } catch (error) {
      lastError = error;
      const worthSwitching = RETRYABLE_STATUSES.has(error.status) || error.status === 404;
      const nextCandidate = candidates[index + 1];
      if (!worthSwitching || !nextCandidate) throw error;
      onModelSwitch?.({ from: candidate, to: nextCandidate, status: error.status });
    }
  }

  if (!model) throw lastError;

  // Both providers can in principle return something malformed; fail loudly
  // rather than writing a broken cv.json.
  const missing = REQUIRED_KEYS.filter((key) => !parsed?.[key]);
  if (missing.length) {
    throw new Error(`The extracted data is missing: ${missing.join(", ")}. Try the import again.`);
  }

  return { parsed, usage, provider, model };
}

/** Turn a provider error into a message worth showing a human. */
export function describeProviderError(error, provider, model) {
  const status = error?.status;
  const text = String(error?.message ?? error);

  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID/i.test(text)) {
    return provider === "gemini"
      ? "The Gemini API key was rejected. Check GEMINI_API_KEY."
      : "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (status === 404) {
    // Do not claim to know why: a 404 here usually means the model name is
    // wrong or retired, but the API's own message is more reliable than a
    // guess, so show it.
    return (
      `The API returned 404 for model "${model}".\n` +
      (provider === "gemini"
        ? '  Try CV_MODEL=gemini-flash-latest — pinned versions are often listed\n' +
          "  but no longer served. Model names: https://ai.google.dev/gemini-api/docs/models\n"
        : "  Model names: https://docs.claude.com/en/docs/about-claude/models\n") +
      `  API said: ${text.slice(0, 200)}`
    );
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return provider === "gemini"
      ? "The Gemini free-tier quota is used up for now. Wait a minute and try again."
      : "Rate limited by the API. Wait a minute and try again.";
  }
  if (status === 503 || /UNAVAILABLE|high demand/i.test(text)) {
    return (
      "The model is busy right now and did not free up after several retries.\n" +
      "  This is congestion on the provider's side, not a problem with your setup.\n" +
      "  Wait a few minutes and run the same command again."
    );
  }
  return text;
}
