import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch, type FieldPath, type Resolver, type UseFormReturn } from "react-hook-form";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { adminKeys, invalidateAfterChange, recipeApi, useAdminCategories, useAdminRecipe } from "@/api/admin";
import { ApiError, errorMessage } from "@/api/client";
import type { CategoryAdmin, RecipeAdmin } from "@/api/schemas";
import {
  emptyValues,
  EditorSchema,
  toValues,
  type EditorValues,
} from "@/components/admin/editorForm";
import { ImageField } from "@/components/admin/ImageField";
import { IngredientsEditor } from "@/components/admin/IngredientsEditor";
import { NutritionEditor } from "@/components/admin/NutritionEditor";
import { SaveIndicator } from "@/components/admin/SaveIndicator";
import { StepsEditor } from "@/components/admin/StepsEditor";
import { useAutosave, type SlugState } from "@/components/admin/useAutosave";
import { Button } from "@/components/Button";
import { ConfirmDialog, Drawer } from "@/components/Dialog";
import { Field, Textarea } from "@/components/Input";
import { RecipeView, type RecipeViewData } from "@/components/recipe/RecipeView";
import { Select } from "@/components/Select";
import { Skeleton } from "@/components/Skeleton";
import { Stepper } from "@/components/Stepper";
import { useToast } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { cx } from "@/lib/cx";
import { formatDuration, parseDecimal } from "@/lib/format";
import { useEventListener, useReducedMotion } from "@/lib/hooks";
import { useMeta } from "@/lib/meta";
import { missingSentence, sectionOf, SECTIONS, type SectionId } from "@/lib/missing";

type Action = "publish" | "unpublish" | "feature" | "unfeature";

const FORM_FIELDS = new Set(["title", "description", "category_id", "prep_time_minutes", "servings", "calories", "protein_g", "carbs_g", "fat_g", "slug"]);

// l'aperçu réutilise la vraie page recette, avec ce qu'il y a dans le formulaire
function PreviewPane({ form, server, categories, localImage }: { form: UseFormReturn<EditorValues>; server: RecipeAdmin | null; categories: CategoryAdmin[]; localImage: string | null }) {
  const values = useWatch({ control: form.control }) as EditorValues;
  const category = categories.find((c) => c.id === values.category_id) ?? server?.category;
  const minutes = /^\d+$/.test(values.prep_time_minutes?.trim() ?? "") ? Number(values.prep_time_minutes) : null;
  const decimal = (value: string) => {
    const parsed = parseDecimal(value);
    return parsed != null && Number.isFinite(parsed) ? parsed : null;
  };
  const data: RecipeViewData = {
    id: server?.id ?? 0,
    slug: server?.slug ?? "apercu",
    title: values.title ?? "",
    description: values.description ?? "",
    category: { name: category?.name ?? "Catégorie", slug: category?.slug ?? "" },
    prep_time_minutes: minutes,
    servings: values.servings,
    is_dietetic: values.is_dietetic,
    image: server?.image ?? null,
    ingredients: (values.ingredients ?? [])
      .filter((row) => row.name?.trim())
      .map((row) => ({ name: row.name.trim(), quantity: decimal(row.quantity), unit: row.unit })),
    steps: (values.steps ?? []).filter((s) => s.content?.trim()).map((s) => ({ content: s.content.trim() })),
    nutrition: { calories: decimal(values.calories), protein_g: decimal(values.protein_g), carbs_g: decimal(values.carbs_g), fat_g: decimal(values.fat_g) },
  };
  return (
    <div className="preview-body">
      <RecipeView recipe={data} preview previewImageUrl={localImage} />
    </div>
  );
}

export default function Editor() {
  const { id: param } = useParams();
  const paramId = param && param !== "new" && /^\d+$/.test(param) ? Number(param) : null;
  const isNew = param === "new";
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const reduced = useReducedMotion();
  const categories = useAdminCategories();
  const query = useAdminRecipe(paramId);

  const form = useForm<EditorValues>({
    resolver: zodResolver(EditorSchema) as unknown as Resolver<EditorValues>,
    mode: "onChange",
    defaultValues: emptyValues(),
  });

  const idRef = useRef<number | null>(paramId);
  const loaded = useRef<number | "new" | null>(null);
  const createdHere = useRef(new Set<number>());
  const creating = useRef<Promise<RecipeAdmin> | null>(null);
  const allowNav = useRef(false);
  const slug = useRef<SlugState>({ edited: false, force: false });
  const [server, setServer] = useState<RecipeAdmin | null>(null);
  const serverRef = useRef(server);
  serverRef.current = server;
  const [slugUnlocked, setSlugUnlocked] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState(false);
  const [preview, setPreview] = useState(false);
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [attempted, setAttempted] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaveAnyway, setLeaveAnyway] = useState(false);

  // après suppression on vide le cache seulement au démontage, sinon la requête repart (et fait un 404)
  const deleted = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (deleted.current != null) client.removeQueries({ queryKey: adminKeys.recipe(deleted.current) });
    },
    [client],
  );
  const applySavedRef = useRef<(recipe: RecipeAdmin) => void>(() => undefined);
  const autosave = useAutosave({
    form,
    getId: () => idRef.current,
    getImageId: () => serverRef.current?.image_id ?? null,
    slug,
    onSaved: (recipe) => applySavedRef.current(recipe),
  });
  // passé par une ref pour que les effets en dessous ne se relancent pas à chaque rendu
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  const applySaved = useCallback(
    (saved: RecipeAdmin) => {
      setServer(saved);
      invalidateAfterChange(client, saved);
      autosave.silently(() => {
        if (!slug.current.edited && form.getValues("slug") !== saved.slug) form.setValue("slug", saved.slug);
        if (form.getValues("category_id") == null) form.setValue("category_id", saved.category_id);
      });
      if (!slug.current.force) setSlugUnlocked(false);
    },
    [autosave, client, form],
  );
  applySavedRef.current = applySaved;

  // chargement / changement de recette
  useEffect(() => {
    if (paramId == null) {
      if (isNew && loaded.current !== "new") {
        loaded.current = "new";
        idRef.current = null;
        creating.current = null;
        setServer(null);
        setAttempted([]);
        setSlugUnlocked(false);
        slug.current = { edited: false, force: false };
        autosaveRef.current.reset(emptyValues(), null);
        window.setTimeout(() => document.getElementById("recipe-title")?.focus(), 50);
      }
      return;
    }
    idRef.current = paramId;
  }, [paramId, isNew]);

  useEffect(() => {
    const data = query.data;
    if (!data || data.id !== paramId || loaded.current === data.id) return;
    loaded.current = data.id;
    if (createdHere.current.has(data.id)) return; // on vient de le créer, on n'écrase pas ce qui est en train d'être tapé
    setServer(data);
    setAttempted([]);
    setSlugUnlocked(false);
    slug.current = { edited: false, force: false };
    autosaveRef.current.reset(toValues(data), data.updated_at);
  }, [query.data, paramId]);

  // le brouillon est créé dès qu'on tape un titre
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name !== "title" || idRef.current != null || creating.current) return;
      const title = (values.title ?? "").trim();
      if (!title) return;
      const pending = recipeApi.create({ title, ...(values.category_id ? { category_id: values.category_id } : {}) });
      creating.current = pending;
      pending
        .then((saved) => {
          idRef.current = saved.id;
          loaded.current = saved.id;
          createdHere.current.add(saved.id);
          client.setQueryData(adminKeys.recipe(saved.id), saved);
          applySavedRef.current(saved);
          autosaveRef.current.lastAt.current = saved.updated_at;
          allowNav.current = true;
          navigate(`/admin/recipes/${saved.id}`, { replace: true });
          void autosaveRef.current.flush();
        })
        .catch((error) => {
          creating.current = null;
          autosaveRef.current.setStatus({ kind: "error", message: errorMessage(error), at: null });
        });
    });
    return () => subscription.unsubscribe();
  }, [form, client, navigate]);

  // ⌘S
  const saveNow = useCallback(async () => {
    if (idRef.current == null) {
      void form.trigger("title");
      document.getElementById("recipe-title")?.focus();
      return;
    }
    await autosave.flush("put");
  }, [autosave, form]);

  useEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveNow();
    }
  });
  useEventListener("beforeunload", () => {
    if (autosave.hasPending()) void autosave.flush("patch", true);
  });
  useEffect(() => {
    const onVisibility = () => document.visibilityState === "hidden" && autosaveRef.current.hasPending() && void autosaveRef.current.flush();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // on enregistre avant de changer de page dans l'admin
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowNav.current) {
      allowNav.current = false;
      return false;
    }
    return autosave.hasPending() && currentLocation.pathname !== nextLocation.pathname;
  });
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void autosaveRef.current.flush().then(() => {
      if (!autosaveRef.current.hasPending()) blocker.proceed();
      else setLeaveAnyway(true);
    });
  }, [blocker.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // actions
  const scrollToSection = (section: SectionId) =>
    document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

  const runAction = async (action: Action) => {
    const id = idRef.current;
    if (id == null) return;
    setBusy(action);
    try {
      await autosave.flush();
      if (autosave.hasPending()) {
        toast.error("Corrigez d'abord les champs signalés : ils ne sont pas encore enregistrés.");
        return;
      }
      const saved = await recipeApi.action(id, action);
      applySaved(saved);
      if (action === "publish") {
        setAttempted([]);
        toast.show("Recette publiée : elle apparaît sur le site.", {
          action: { label: "Voir", onClick: () => window.open(`/recettes/${saved.slug}`, "_blank", "noopener") },
        });
      } else if (action === "unpublish") toast.show("Recette retirée du site.");
      else if (action === "feature") toast.show("Recette mise en avant sur l'accueil.");
    } catch (error) {
      if (error instanceof ApiError && error.detail === "incomplete") {
        setAttempted(error.missing);
        for (const item of error.errors) {
          if (FORM_FIELDS.has(item.field)) form.setError(item.field as FieldPath<EditorValues>, { type: "server", message: item.message });
        }
        const first = SECTIONS.find((s) => error.missing.some((f) => sectionOf(f) === s.id));
        if (first) scrollToSection(first.id);
        toast.error(`Publication impossible : ${missingSentence(error.missing)}.`);
      } else {
        toast.error(errorMessage(error));
      }
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    const id = idRef.current;
    if (id == null) return;
    setBusy("duplicate");
    try {
      await autosave.flush();
      const copy = await recipeApi.action(id, "duplicate");
      invalidateAfterChange(client, copy);
      toast.show("Copie créée : vous éditez maintenant le brouillon.");
      allowNav.current = true;
      navigate(`/admin/recipes/${copy.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const id = idRef.current;
    if (id == null) return;
    setBusy("delete");
    try {
      await recipeApi.remove(id);
      autosave.reset(form.getValues(), null);
      invalidateAfterChange(client);
      toast.show(`« ${server?.title ?? "La recette"} » a été supprimée.`);
      allowNav.current = true;
      deleted.current = id;
      navigate("/admin/recipes");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  };

  // rendu
  const title = useWatch({ control: form.control, name: "title" });
  const prepTime = useWatch({ control: form.control, name: "prep_time_minutes" });
  useMeta({ title: title ? `Éditer « ${title} »` : "Nouvelle recette", noindex: true });

  if (paramId != null && query.error) {
    return (
      <div className="panel panel-body">
        <h1 className="serif h3">Recette introuvable.</h1>
        <p className="field-hint">Elle a peut-être été supprimée.</p>
        <Link to="/admin/recipes" className="u">
          Retour à la liste
        </Link>
      </div>
    );
  }
  if (paramId != null && !server && query.isPending) {
    return (
      <div className="panel panel-body" aria-busy="true">
        <Skeleton line style={{ height: 28, width: "40%", marginBottom: 24 }} />
        <Skeleton style={{ height: 320 }} />
      </div>
    );
  }

  const errors = form.formState.errors;
  const missingNow = new Set(server?.missing ?? []);
  const highlighted = new Set(attempted.filter((f) => missingNow.has(f)).map(sectionOf).filter(Boolean) as SectionId[]);
  const todo = new Set([...missingNow].map(sectionOf).filter(Boolean) as SectionId[]);
  const published = server?.is_published ?? false;
  const locked = Boolean(server?.slug_locked) && !slugUnlocked;
  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const note = (section: SectionId, text: string) =>
    highlighted.has(section) ? (
      <p className="missing-note" role="alert">
        {text}
      </p>
    ) : null;

  return (
    <div className={cx("editor", preview && "has-preview")}>
      <div className="panel">
        <div className="admin-top">
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <div className="title">{title?.trim() || "Nouvelle recette"}</div>
            <SaveIndicator status={autosave.status} published={server ? published : null} onRetry={() => void autosave.flush()} />
          </div>
          <div className="buttons">
            <Button onClick={() => setPreview((v) => !v)} aria-pressed={preview} aria-controls="preview-panel">
              Aperçu
            </Button>
            {published ? (
              <Button onClick={() => runAction("unpublish")} disabled={busy != null}>
                Retirer de la publication
              </Button>
            ) : (
              <Button variant="primary" onClick={() => runAction("publish")} disabled={!server || busy != null}>
                {busy === "publish" ? "Publication…" : "Publier"}
              </Button>
            )}
            {published && server && (
              <a className="btn quiet" href={`/recettes/${server.slug}`} target="_blank" rel="noopener">
                Voir sur le site
              </a>
            )}
            <Button variant="quiet" small onClick={duplicate} disabled={!server || busy != null}>
              Dupliquer
            </Button>
            <Button variant="quiet" small danger onClick={() => setConfirmDelete(true)} disabled={!server || busy != null}>
              Supprimer
            </Button>
          </div>
        </div>

        <div className="editor-grid">
          <nav className="section-nav" aria-label="Sections de l'éditeur">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#section-${section.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection(section.id);
                }}
              >
                {section.label}
                {highlighted.has(section.id) ? (
                  <span className="flag" aria-label="incomplète" />
                ) : todo.has(section.id) && server && !published ? (
                  <span className="todo" aria-label="à compléter" />
                ) : server ? (
                  <span className="ok" aria-hidden="true" />
                ) : null}
              </a>
            ))}
            {server && !published && server.missing.length > 0 && (
              <p className="field-hint" style={{ padding: "12px 10px 0" }}>
                Pour publier : {missingSentence(server.missing)}.
              </p>
            )}
            <p className="field-hint" style={{ padding: "12px 10px 0" }}>
              <kbd>⌘</kbd> <kbd>S</kbd> enregistre tout de suite.
            </p>
          </nav>

          <form className="editor-body" onSubmit={(e) => e.preventDefault()} noValidate>
            <section id="section-general" className={cx("editor-section", highlighted.has("general") && "is-missing")} aria-labelledby="h-general">
              <header>
                <h2 id="h-general">Général</h2>
              </header>
              {note("general", "Complétez les champs signalés.")}
              <Field label="Titre" error={errors.title?.message}>
                {({ describedBy, invalid }) => (
                  <Textarea
                    id="recipe-title"
                    className="--title"
                    placeholder="Poulet rôti au citron confit"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    autoFocus={isNew}
                    onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                    {...form.register("title")}
                  />
                )}
              </Field>

              <Field
                label="Adresse"
                error={errors.slug?.message}
                hint={
                  locked
                    ? "Verrouillée : la recette a déjà été publiée, son adresse a pu circuler."
                    : server?.slug_locked
                      ? "Déverrouillée : la nouvelle adresse remplacera l'ancienne à l'enregistrement."
                      : "Générée depuis le titre ; modifiable tant que la recette n'a jamais été publiée."
                }
                labelAction={
                  locked ? (
                    <button type="button" className="link-btn" onClick={() => setConfirmSlug(true)}>
                      Modifier quand même
                    </button>
                  ) : null
                }
              >
                {({ id, describedBy, invalid }) => (
                  <div className="slug-field">
                    <span className="prefix">/recettes/</span>
                    <input
                      id={id}
                      className="input"
                      readOnly={locked}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      spellCheck={false}
                      autoCapitalize="off"
                      {...form.register("slug", { onChange: () => (slug.current.edited = true) })}
                    />
                  </div>
                )}
              </Field>

              <Field label="Description" error={errors.description?.message} hint="Deux phrases, concrètes : ce qu'est le plat, et ce qui le rend juste.">
                {({ id, describedBy, invalid }) => (
                  <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register("description")} />
                )}
              </Field>

              <div className="two-cols">
                <div className="field">
                  <span className="label" id="category-label">
                    Catégorie
                  </span>
                  <Controller
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <Select
                        labelledBy="category-label"
                        value={field.value}
                        options={categoryOptions}
                        onChange={field.onChange}
                        placeholder={categories.isPending ? "Chargement…" : "Choisir une catégorie"}
                        invalid={Boolean(errors.category_id)}
                      />
                    )}
                  />
                  {errors.category_id && <p className="field-error">{errors.category_id.message}</p>}
                </div>
                <div className="three-cols" style={{ gridTemplateColumns: "1fr auto", alignItems: "end" }}>
                  <Field label="Temps (minutes)" error={errors.prep_time_minutes?.message} hint={prepTime && /^\d+$/.test(prepTime.trim()) ? formatDuration(Number(prepTime)) : "Préparation et cuisson."}>
                    {({ id, describedBy, invalid }) => (
                      <input id={id} className="input tnum" inputMode="numeric" autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...form.register("prep_time_minutes")} />
                    )}
                  </Field>
                  <div className="field">
                    <span className="label">Portions</span>
                    <Controller control={form.control} name="servings" render={({ field }) => <Stepper value={field.value} onChange={field.onChange} label="Portions" />} />
                    <p className="field-hint">&nbsp;</p>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 20 }}>
                <Controller
                  control={form.control}
                  name="is_dietetic"
                  render={({ field }) => (
                    <Toggle label="Diététique" description="Affiche la recette dans l'option Diététique de sa catégorie. Réservé aux recettes allégées pour de vrai." checked={field.value} onChange={field.onChange} />
                  )}
                />
                <Toggle
                  label="En avant"
                  tone="accent"
                  description={published ? "Remplace la recette de la semaine en tête de l'accueil." : "Seule une recette publiée peut être mise en avant."}
                  checked={server?.is_featured ?? false}
                  disabled={!published || busy != null}
                  onChange={(value) => runAction(value ? "feature" : "unfeature")}
                />
              </div>
            </section>

            <section id="section-image" className={cx("editor-section", highlighted.has("image") && "is-missing")} aria-labelledby="h-image">
              <header>
                <h2 id="h-image">Image</h2>
              </header>
              {note("image", "Ajoutez une image : elle est obligatoire pour publier.")}
              {server ? (
                <ImageField
                  image={server.image}
                  missing={highlighted.has("image")}
                  onPreview={setLocalImage}
                  onUploaded={async (image) => {
                    await autosave.enqueue({ image_id: image.id });
                  }}
                  onRemove={() => void autosave.enqueue({ image_id: null })}
                />
              ) : (
                <p className="field-hint">Donnez d'abord un titre : le brouillon sera créé, et vous pourrez y déposer une image.</p>
              )}
            </section>

            <section id="section-ingredients" className={cx("editor-section", highlighted.has("ingredients") && "is-missing")} aria-labelledby="h-ingredients">
              <header>
                <h2 id="h-ingredients">Ingrédients</h2>
                <span className="field-hint">Pour le nombre de portions indiqué.</span>
              </header>
              {note("ingredients", "Ajoutez au moins un ingrédient.")}
              <IngredientsEditor form={form} />
            </section>

            <section id="section-nutrition" className={cx("editor-section", highlighted.has("nutrition") && "is-missing")} aria-labelledby="h-nutrition">
              <header>
                <h2 id="h-nutrition">Nutrition par portion</h2>
              </header>
              {note("nutrition", attempted.includes("nutrition_coherence") ? "Les calories et les macros divergent de plus de 40 %." : "Renseignez les quatre valeurs.")}
              <NutritionEditor form={form} />
            </section>

            <section id="section-steps" className={cx("editor-section", highlighted.has("steps") && "is-missing")} aria-labelledby="h-steps">
              <header>
                <h2 id="h-steps">Étapes</h2>
              </header>
              {note("steps", "Ajoutez au moins une étape.")}
              <StepsEditor form={form} />
            </section>
          </form>
        </div>
      </div>

      <Drawer open={preview} onClose={() => setPreview(false)} title="Aperçu de la page" wide modal={false}>
        <div id="preview-panel">
          <PreviewPane form={form} server={server} categories={categories.data ?? []} localImage={localImage} />
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmSlug}
        title="Changer l'adresse d'une recette publiée ?"
        message={`Les liens déjà partagés vers /recettes/${server?.slug ?? ""} ne fonctionneront plus. Ne le faites que pour corriger une erreur.`}
        confirmLabel="Modifier l'adresse"
        onCancel={() => setConfirmSlug(false)}
        onConfirm={() => {
          setConfirmSlug(false);
          setSlugUnlocked(true);
          slug.current = { edited: slug.current.edited, force: true };
          window.setTimeout(() => document.querySelector<HTMLInputElement>(".slug-field input")?.focus(), 50);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Supprimer « ${server?.title ?? ""} » ?`}
        message="La recette, ses ingrédients et ses étapes seront supprimés définitivement. Son image reste dans la médiathèque jusqu'au prochain nettoyage."
        confirmLabel="Supprimer"
        danger
        busy={busy === "delete"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
      <ConfirmDialog
        open={leaveAnyway}
        title="Quitter sans enregistrer ?"
        message="Les dernières modifications n'ont pas pu être enregistrées. Corrigez les champs signalés, ou quittez en les abandonnant."
        confirmLabel="Quitter quand même"
        danger
        onCancel={() => {
          setLeaveAnyway(false);
          blocker.reset?.();
        }}
        onConfirm={() => {
          setLeaveAnyway(false);
          autosave.reset(form.getValues(), null);
          blocker.proceed?.();
        }}
      />
    </div>
  );
}
