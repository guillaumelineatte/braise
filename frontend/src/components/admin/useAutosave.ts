import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import { recipeApi } from "@/api/admin";
import { ApiError, errorMessage } from "@/api/client";
import type { RecipeAdmin, RecipeUpdate } from "@/api/schemas";
import { missingSentence } from "@/lib/missing";
import { buildPatch, buildPut, type EditorValues, type FieldKey, type IndexMap } from "./editorForm";

export type SaveStatus =
  | { kind: "idle" | "pending" | "saving"; at: string | null }
  | { kind: "saved"; at: string }
  | { kind: "needs-title" }
  | { kind: "error"; message: string; at: string | null };

export interface SlugState {
  edited: boolean;
  force: boolean;
}

interface Options {
  form: UseFormReturn<EditorValues>;
  getId: () => number | null;
  getImageId: () => number | null;
  slug: MutableRefObject<SlugState>;
  onSaved: (recipe: RecipeAdmin) => void;
  delay?: number;
}

const ROOT_FIELDS = new Set<string>([
  "title",
  "slug",
  "description",
  "category_id",
  "prep_time_minutes",
  "servings",
  "is_dietetic",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "ingredients",
  "steps",
]);

// traduit le chemin d'une erreur renvoyée par l'API en chemin du formulaire
function formPath(field: string, indexMap: IndexMap): string | null {
  const [root, index, ...rest] = field.split(".");
  if (!ROOT_FIELDS.has(root)) return null;
  if ((root === "ingredients" || root === "steps") && index !== undefined) {
    const mapped = indexMap[root][Number(index)];
    return mapped === undefined ? root : [root, mapped, ...rest].join(".");
  }
  return root;
}

// Sauvegarde auto : PATCH des champs modifiés 2 s après la dernière frappe, une requête à la fois.
// flush() part tout de suite (⌘S en PUT, changement d'onglet, fermeture avec keepalive).
// Un champ invalide reste en attente tant qu'il n'est pas corrigé.
export function useAutosave({ form, getId, getImageId, slug, onSaved, delay = 2000 }: Options) {
  const dirty = useRef(new Set<FieldKey>());
  const extra = useRef<RecipeUpdate>({});
  const chain = useRef<Promise<void>>(Promise.resolve());
  const busy = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const suppress = useRef(false);
  const lastAt = useRef<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle", at: null });
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const run = useCallback(
    async (mode: "patch" | "put", keepalive: boolean) => {
      const id = getId();
      if (id == null) {
        if (dirty.current.size) setStatus({ kind: "needs-title" });
        return;
      }
      const values = form.getValues();
      const pendingExtra = extra.current;
      const fields = [...dirty.current];
      if (mode === "patch" && fields.length === 0 && Object.keys(pendingExtra).length === 0) {
        setStatus(lastAt.current ? { kind: "saved", at: lastAt.current } : { kind: "idle", at: null });
        return;
      }
      const full = mode === "put" ? buildPut(values, getImageId(), slug.current) : null;
      const built = full ?? buildPatch(values, fields, slug.current);
      const body: RecipeUpdate = { ...built.body, ...pendingExtra };
      const sent = Object.keys(body) as FieldKey[];
      dirty.current = new Set(built.invalid);
      extra.current = {};

      if (sent.length === 0) {
        setStatus({ kind: "error", message: "Corrigez les champs signalés pour enregistrer.", at: lastAt.current });
        return;
      }
      busy.current += 1;
      setStatus({ kind: "saving", at: lastAt.current });
      try {
        const saved = full ? await recipeApi.put(id, full.body) : await recipeApi.patch(id, body, keepalive);
        lastAt.current = saved.updated_at;
        if ("slug" in body) slug.current = { edited: false, force: false };
        for (const field of sent) {
          const state = form.getFieldState(field as FieldPath<EditorValues>);
          if (state.error?.type === "server") form.clearErrors(field as FieldPath<EditorValues>);
        }
        onSavedRef.current(saved);
        if (dirty.current.size && built.invalid.length) {
          setStatus({ kind: "error", message: "Corrigez les champs signalés pour enregistrer.", at: saved.updated_at });
        } else {
          setStatus(dirty.current.size ? { kind: "pending", at: saved.updated_at } : { kind: "saved", at: saved.updated_at });
        }
      } catch (error) {
        // on remet les champs dans la file, ils repartiront au prochain essai
        fields.forEach((f) => dirty.current.add(f));
        if (full) Object.keys(full.body).forEach((f) => (f as FieldKey) in form.getValues() && dirty.current.add(f as FieldKey));
        extra.current = { ...pendingExtra, ...extra.current };
        let message = errorMessage(error);
        if (error instanceof ApiError) {
          for (const item of error.errors) {
            const path = formPath(item.field, built.indexMap);
            if (path) form.setError(path as FieldPath<EditorValues>, { type: "server", message: item.message });
          }
          if (error.detail === "incomplete") {
            message = `Recette en ligne : ce changement la rendrait incomplète (${missingSentence(error.missing)}). Retirez-la d'abord de la publication.`;
          }
        }
        setStatus({ kind: "error", message, at: lastAt.current });
      } finally {
        busy.current -= 1;
      }
    },
    [form, getId, getImageId, slug],
  );

  const flush = useCallback(
    (mode: "patch" | "put" = "patch", keepalive = false): Promise<void> => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      if (keepalive && busy.current === 0) {
        // page en train de se fermer : pas le temps d'attendre la file
        const direct = run(mode, true);
        chain.current = direct.catch(() => undefined);
        return direct;
      }
      const next = chain.current.then(() => run(mode, keepalive));
      chain.current = next.catch(() => undefined);
      return next;
    },
    [run],
  );

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), delay);
    setStatus(getId() == null ? { kind: "needs-title" } : { kind: "pending", at: lastAt.current });
  }, [delay, flush, getId]);

  // pour ce qui n'est pas dans le formulaire (l'image), envoyé avec le reste
  const enqueue = useCallback(
    (body: RecipeUpdate) => {
      extra.current = { ...extra.current, ...body };
      return flush();
    },
    [flush],
  );

  // modifie le formulaire sans déclencher de sauvegarde (valeurs qui viennent du serveur)
  const silently = useCallback((fn: () => void) => {
    suppress.current = true;
    try {
      fn();
    } finally {
      suppress.current = false;
    }
  }, []);

  const reset = useCallback(
    (values: EditorValues, savedAt: string | null) => {
      window.clearTimeout(timer.current);
      dirty.current.clear();
      extra.current = {};
      lastAt.current = savedAt;
      silently(() => form.reset(values));
      setStatus(savedAt ? { kind: "saved", at: savedAt } : { kind: "idle", at: null });
    },
    [form, silently],
  );

  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (!name || suppress.current) return;
      const root = name.split(".")[0] as FieldKey;
      if (!ROOT_FIELDS.has(root)) return;
      dirty.current.add(root);
      schedule();
    });
    return () => subscription.unsubscribe();
  }, [form, schedule]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hasPending = useCallback(
    () => dirty.current.size > 0 || busy.current > 0 || timer.current !== undefined || Object.keys(extra.current).length > 0,
    [],
  );

  return { status, flush, schedule, enqueue, silently, reset, hasPending, setStatus, lastAt };
}
