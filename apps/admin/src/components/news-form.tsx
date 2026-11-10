"use client";

import { useState } from "react";
import { newsInputSchema, type NewsCategory, type NewsDto, brand } from "@kickoff/shared";
import type { AdminNewsInput } from "@/lib/queries/news";

const CATEGORIES: NewsCategory[] = ["Club News", "Match Report", "Announcement"];
const DEFAULT_COLORS: [string, string] = [brand.primary, brand.primaryDark];

interface NewsFormProps {
  initial?: Partial<NewsDto>;
  submitting?: boolean;
  onSubmit: (input: AdminNewsInput) => Promise<void> | void;
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 16);
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

export function NewsForm({ initial, submitting = false, onSubmit }: NewsFormProps) {
  const [values, setValues] = useState({
    title: initial?.title ?? "",
    excerpt: initial?.excerpt ?? "",
    body: initial?.body ?? "",
    category: initial?.category ?? "Club News",
    publishedAt: toLocalInput(initial?.publishedAt),
    readMinutes: String(initial?.readMinutes ?? 2),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = newsInputSchema.safeParse({
      title: values.title,
      excerpt: values.excerpt,
      body: values.body,
      category: values.category,
      publishedAt: new Date(values.publishedAt).toISOString(),
      readMinutes: Number(values.readMinutes),
      imageColors: initial?.imageColors ?? DEFAULT_COLORS,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".") || "form"] = issue.message;
      setErrors(next);
      return;
    }

    setErrors({});
    try {
      await onSubmit(parsed.data as AdminNewsInput);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the article.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" error={errors.title} className="sm:col-span-2">
          <input
            value={values.title}
            onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Category" error={errors.category}>
          <select
            value={values.category}
            onChange={(event) =>
              setValues((v) => ({ ...v, category: event.target.value as NewsCategory }))
            }
            className="input">
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Publish at" error={errors.publishedAt}>
          <input
            type="datetime-local"
            value={values.publishedAt}
            onChange={(event) => setValues((v) => ({ ...v, publishedAt: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Read minutes" error={errors.readMinutes}>
          <input
            type="number"
            min="1"
            value={values.readMinutes}
            onChange={(event) => setValues((v) => ({ ...v, readMinutes: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Excerpt" error={errors.excerpt} className="sm:col-span-2">
          <input
            value={values.excerpt}
            onChange={(event) => setValues((v) => ({ ...v, excerpt: event.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Body" error={errors.body} className="sm:col-span-2">
          <textarea
            value={values.body}
            onChange={(event) => setValues((v) => ({ ...v, body: event.target.value }))}
            rows={6}
            className="input h-auto py-2"
          />
        </Field>
      </div>

      {formError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {formError}
        </p>
      ) : null}

      <button type="submit" disabled={submitting} className="btn-primary h-11 px-5 disabled:opacity-60">
        {submitting ? "Saving…" : initial?.id ? "Save article" : "Publish article"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-red-600">{error}</span> : null}
    </label>
  );
}
