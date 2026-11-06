"use client";

import {
  ChevronRight,
  Clock3,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { Badge, Modal, SectionTitle } from "@/components/ui";
import { useAdmin, type NewsInput } from "@/lib/store";
import { cn } from "@/lib/utils";
import { formatFullDate, type NewsItem } from "@xclub/shared";

const categories: NewsItem["category"][] = ["Club News", "Match Report", "Announcement"];

export default function NewsPage() {
  const { news, addNews, updateNews, deleteNews } = useAdmin();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | NewsItem["category"]>("All");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);

  const filtered = news
    .filter((item) => (category === "All" ? true : item.category === category))
    .filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <SectionTitle
        eyebrow="Club feed"
        title="News & results"
        description="Publish official updates, match reports, and supporter announcements."
        action={
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={16} />
            New article
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-xl border border-slate-200 bg-white p-1">
          {(["All", ...categories] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
                category === value ? "bg-pitch text-white" : "text-slate-500 hover:text-slate-800",
              )}>
              {value}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <Search size={14} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search articles"
            className="w-44 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((item, index) => (
          <article
            key={item.id}
            className={cn(
              "panel group overflow-hidden",
              index === 0 && filtered.length > 2 && "lg:col-span-2",
            )}>
            <div className={cn("flex gap-0", index === 0 && filtered.length > 2 && "lg:flex-row")}>
              <div
                className={cn(
                  "relative flex w-28 shrink-0 flex-col justify-between p-3 text-white",
                  index === 0 && filtered.length > 2 && "lg:w-64 lg:p-5",
                )}
                style={{
                  background: `linear-gradient(135deg, ${item.imageColors[0]}, ${item.imageColors[1]})`,
                }}>
                <Badge tone="dark">{item.category}</Badge>
                <span className="display text-[38px] leading-none text-white/20">XC</span>
                <span className="text-[8px] uppercase tracking-[0.14em] text-white/50">Published</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="display text-2xl leading-6 text-slate-900">{item.title}</h2>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-slate-500">
                      {item.excerpt}
                    </p>
                  </div>
                  <Badge tone="green">Live</Badge>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span>{formatFullDate(item.publishedAt)}</span>
                    <span className="flex items-center gap-1">
                      <Clock3 size={10} />
                      {item.readMinutes} min read
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50">
                      <Pencil size={11} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete “${item.title}”?`)) deleteNews(item.id);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete article">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-pitch">
            <Megaphone size={22} />
          </div>
          <h2 className="display mt-4 text-2xl text-slate-900">No articles found</h2>
          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
            Publish the first article or clear the search filter.
          </p>
          <button type="button" onClick={() => setCreating(true)} className="btn-primary mt-4">
            <Plus size={15} />
            New article
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
        <ChevronRight size={12} />
        Published articles appear in the customer mobile home feed immediately in this mock build.
      </div>

      {creating ? (
        <NewsModal
          key="new"
          onClose={() => setCreating(false)}
          onSubmit={(input) => {
            addNews(input);
            setCreating(false);
          }}
          title="Publish article"
          description="Write the update supporters will see in the mobile app."
          submitLabel="Publish to club feed"
        />
      ) : null}

      {editing ? (
        <NewsModal
          key={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            updateNews(editing.id, input);
            setEditing(null);
          }}
          title="Edit article"
          description="Changes are applied to the local mock feed."
          submitLabel="Save changes"
        />
      ) : null}
    </div>
  );
}

function NewsModal({
  onClose,
  onSubmit,
  title,
  description,
  submitLabel,
  initial,
}: {
  onClose: () => void;
  onSubmit: (input: NewsInput) => void;
  title: string;
  description: string;
  submitLabel: string;
  initial?: NewsItem;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    excerpt: initial?.excerpt ?? "",
    body: initial?.body ?? "",
    category: initial?.category ?? ("Club News" as NewsItem["category"]),
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (form.title.trim().length < 5) {
      setError("Add a headline of at least 5 characters.");
      return;
    }
    if (form.body.trim().length < 20) {
      setError("Add article body text of at least 20 characters.");
      return;
    }
    setError(null);
    onSubmit({
      title: form.title.trim(),
      excerpt: form.excerpt.trim() || form.body.trim().slice(0, 140),
      body: form.body.trim(),
      category: form.category,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" form="news-form" className="btn-primary">
            {submitLabel}
          </button>
        </>
      }>
      <form id="news-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <label className="label mb-1.5 block">Headline</label>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className="input"
              placeholder="Matchday guide: Bangkok Rovers at the Arena"
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Category</label>
            <select
              value={form.category}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value as NewsItem["category"] })
              }
              className="input">
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label mb-1.5 block">Excerpt</label>
          <textarea
            value={form.excerpt}
            onChange={(event) => setForm({ ...form, excerpt: event.target.value })}
            className="input min-h-[68px] resize-y"
            placeholder="One or two sentences for the feed card."
          />
        </div>

        <div>
          <label className="label mb-1.5 block">Article body</label>
          <textarea
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
            className="input min-h-[220px] resize-y leading-6"
            placeholder="Write the full update. Use blank lines to separate paragraphs."
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
