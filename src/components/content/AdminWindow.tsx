/**
 * "Update CV" window — the admin panel.
 *
 * Takes a password and a CV file, posts both to /api/import-cv, and reports
 * what the server extracted. The password is never stored anywhere; it is
 * held in component state for the duration of the request only.
 */

import { useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";

const ACCEPTED = ".pdf,.docx,.txt,.md";
const MAX_BYTES = 3 * 1024 * 1024;

interface ImportResult {
  sourceLanguage: "en" | "el";
  provider: string;
  model: string;
  pdfCommitted: string[];
  counts: Record<string, number>;
  warnings: string[];
}

/** Read a File into a base64 string without the data: prefix. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export function AdminWindow() {
  const { ui } = useLanguage();
  const [password, setPassword] = useState("");
  // One slot per language. Filling both avoids machine translation entirely.
  const [fileEn, setFileEn] = useState<File | null>(null);
  const [fileEl, setFileEl] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputEn = useRef<HTMLInputElement>(null);
  const inputEl = useRef<HTMLInputElement>(null);

  const chosen = [
    { lang: "en" as const, file: fileEn },
    { lang: "el" as const, file: fileEl },
  ].filter((entry): entry is { lang: "en" | "el"; file: File } => entry.file !== null);

  const canSubmit = password.length > 0 && chosen.length > 0 && !busy;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!chosen.length || busy) return;

    const total = chosen.reduce((sum, entry) => sum + entry.file.size, 0);
    if (total > MAX_BYTES) {
      setError(ui("adminTooLarge"));
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const files = await Promise.all(
        chosen.map(async (entry) => ({
          filename: entry.file.name,
          base64: await toBase64(entry.file),
          lang: entry.lang,
        })),
      );
      const response = await fetch("/api/import-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, files }),
      });

      // A static host (GitHub Pages) has no /api route and returns the HTML
      // shell instead of JSON — report that clearly rather than crashing.
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(ui("adminNoBackend"));
      }

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);

      setResult(body as ImportResult);
      setPassword("");
      setFileEn(null);
      setFileEl(null);
      if (inputEn.current) inputEn.current.value = "";
      if (inputEl.current) inputEl.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin">
      <p className="admin__intro">{ui("adminIntro")}</p>

      <form className="admin__form" onSubmit={handleSubmit}>
        <label className="admin__field">
          <span>{ui("adminPassword")}</span>
          <input
            type="password"
            className="xp-input"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </label>

        <label className="admin__field">
          <span>{ui("adminFileEn")}</span>
          <input
            type="file"
            className="xp-input"
            ref={inputEn}
            accept={ACCEPTED}
            onChange={(event) => setFileEn(event.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </label>

        <label className="admin__field">
          <span>{ui("adminFileEl")}</span>
          <input
            type="file"
            className="xp-input"
            ref={inputEl}
            accept={ACCEPTED}
            onChange={(event) => setFileEl(event.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </label>

        <p className="admin__hint">
          {chosen.length === 2 ? ui("adminBothGood") : ui("adminBothBetter")}
        </p>

        <button type="submit" className="xp-button xp-button--primary" disabled={!canSubmit}>
          {busy ? ui("adminWorking") : ui("adminSubmit")}
        </button>
      </form>

      {busy && <p className="admin__status">{ui("adminPatience")}</p>}

      {error && (
        <p className="admin__error" role="alert">
          {ui("adminFailed")}: {error}
        </p>
      )}

      {result && (
        <div className="admin__result" role="status">
          <p className="admin__ok">{ui("adminDone")}</p>
          <ul className="admin__counts">
            <li>
              {ui("education")}: <b>{result.counts.education}</b>
            </li>
            <li>
              {ui("experience")}: <b>{result.counts.experience}</b>
            </li>
            <li>
              {ui("projects")}: <b>{result.counts.projects}</b>
            </li>
            <li>
              {ui("skills")}: <b>{result.counts.skills}</b>
            </li>
          </ul>
          {result.pdfCommitted.length > 0 && (
            <p className="admin__note">
              {ui("adminPdfSaved")}: <b>{result.pdfCommitted.join(", ")}</b>
            </p>
          )}
          <p className="admin__note">{ui("adminRedeploy")}</p>
          <p className="admin__meta">
            {result.provider} · {result.model}
          </p>
          {result.warnings.length > 0 && (
            <ul className="admin__warnings">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
