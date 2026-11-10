"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toNewsDto, type NewsCategory } from "@kickoff/shared";
import { createClient } from "@/lib/supabase/client";

export interface AdminNewsInput {
  title: string;
  excerpt: string;
  body: string;
  category: NewsCategory;
  publishedAt: string;
  readMinutes: number;
  imageColors: [string, string];
}

export function useNews() {
  return useQuery({
    queryKey: ["admin-news"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("news_items")
        .select("*")
        .order("published_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toNewsDto);
    },
  });
}

export function useCreateNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminNewsInput) => {
      const { data, error } = await createClient()
        .from("news_items")
        .insert({
          title: input.title,
          excerpt: input.excerpt,
          body: input.body,
          category: input.category,
          published_at: input.publishedAt,
          read_minutes: input.readMinutes,
          image_colors: input.imageColors,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return toNewsDto(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-news"] });
    },
  });
}

export function useUpdateNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<AdminNewsInput> }) => {
      const patch: {
        title?: string;
        excerpt?: string;
        body?: string;
        category?: string;
        published_at?: string;
        read_minutes?: number;
        image_colors?: string[];
      } = {};
      if (input.patch.title !== undefined) patch.title = input.patch.title;
      if (input.patch.excerpt !== undefined) patch.excerpt = input.patch.excerpt;
      if (input.patch.body !== undefined) patch.body = input.patch.body;
      if (input.patch.category !== undefined) patch.category = input.patch.category;
      if (input.patch.publishedAt !== undefined) patch.published_at = input.patch.publishedAt;
      if (input.patch.readMinutes !== undefined) patch.read_minutes = input.patch.readMinutes;
      if (input.patch.imageColors !== undefined) patch.image_colors = input.patch.imageColors;

      const { data, error } = await createClient()
        .from("news_items")
        .update(patch)
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return toNewsDto(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-news"] });
    },
  });
}

export function useDeleteNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("news_items").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-news"] });
    },
  });
}
