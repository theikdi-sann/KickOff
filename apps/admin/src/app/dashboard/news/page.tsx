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
import { NewsForm } from "@/components/news-form";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  SectionTitle,
  Skeleton,
  useToast,
} from "@/components/ui";
import {
  useCreateNews,
  useDeleteNews,
  useNews,
  useUpdateNews,
  type AdminNewsInput,
} from "@/lib/queries/news";
import { cn } from "@/lib/utils";
import { formatFullDate, type NewsCategory, type NewsDto } from "@kickoff/shared";

const categories: NewsCategory[] = ["Club News", "Match Report", "Announcement"];

export default function NewsPage() {
  const { toast } = useToast();
  const { data: news, isLoading, error } = useNews();
  const createNews = useCreateNews();
  const updateNews = useUpdateNews();
  const deleteNews = useDeleteNews();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | NewsCategory>("All");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<NewsDto | null>(null);
  const [deleting, setDeleting] = useState<NewsDto | null>(null);

  const allNews = news ?? [];
  const filtered = allNews
    .filter((item) => (category === "All" ? true : item.category === category))
    .filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));

  const handleCreate = async (input: AdminNewsInput) => {
    await createNews.mutateAsync(input);
    setCreating(false);
    toast({ title: "Article published", description: "It is live in the supporter feed.", tone: "green" });
  };

  const handleUpdate = async (input: AdminNewsInput) => {
    if (!editing) return;
    await updateNews.mutateAsync({ id: editing.id, patch: input });
    setEditing(null);
    toast({ title: "Article updated", description: "Changes are live.", tone: "green" });
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteNews.mutateAsync(deleting.id);
      toast({ title: "Article deleted", description: deleting.title, tone: "amber" });
    } catch (caught) {
      toast({
        title: "Could not delete article",
        description: caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "red",
      });
    } finally {
      setDeleting(null);
    }
  };

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

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : error ? (
        <div className="panel p-8 text-center text-sm text-red-600">
          {error instanceof Error ? error.message : "Could not load articles."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Megaphone size={22} />}
            title="No articles found"
            description="Publish the first article or clear the search filter."
            action={
              <button type="button" onClick={() => setCreating(true)} className="btn-primary">
                <Plus size={15} />
                New article
              </button>
            }
          />
        </div>
      ) : (
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
                  <span className="display text-[38px] leading-none text-white/20">KO</span>
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
                        onClick={() => setDeleting(item)}
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
      )}

      <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
        <ChevronRight size={12} />
        Published articles appear in the customer mobile home feed from the same Supabase row.
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Publish article"
        description="Write the update supporters will see in the mobile app."
        wide>
        <NewsForm submitting={createNews.isPending} onSubmit={handleCreate} />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit article"
        description="Changes are applied to the club feed immediately."
        wide>
        <NewsForm
          key={editing?.id ?? "edit"}
          initial={editing ?? undefined}
          submitting={updateNews.isPending}
          onSubmit={handleUpdate}
        />
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete article?"
        description={deleting ? `“${deleting.title}” will be removed from the supporter feed.` : undefined}
        confirmLabel="Delete article"
        busy={deleteNews.isPending}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
