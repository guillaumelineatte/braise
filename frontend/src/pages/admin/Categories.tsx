import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { adminKeys, categoryApi, invalidateAfterChange, useAdminCategories } from "@/api/admin";
import { ApiError, errorMessage } from "@/api/client";
import type { CategoryAdmin } from "@/api/schemas";
import { Button } from "@/components/Button";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { Input } from "@/components/Input";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";

function CategoryItem({
  category,
  onRename,
  onDelete,
}: {
  category: CategoryAdmin;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Donnez un nom.");
    try {
      await onRename(name.trim());
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? (e.errors[0]?.message ?? e.detail) : errorMessage(e));
    }
  };

  return (
    <li ref={setNodeRef} className={cx("cat-item", isDragging && "is-dragging")} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="handle"
        aria-label={`Déplacer « ${category.name} »`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      {editing ? (
        <form onSubmit={submit} style={{ display: "grid", gap: 6 }}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`Nouveau nom pour « ${category.name} »`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                setName(category.name);
                setError(null);
              }
            }}
          />
          <span className="field-hint">
            {category.slug_locked
              ? `L'adresse /recettes?category=${category.slug} est conservée : des recettes de cette catégorie ont déjà été publiées.`
              : "L'adresse de la catégorie suivra le nouveau nom."}
          </span>
          {error && <span className="field-error">{error}</span>}
        </form>
      ) : (
        <div>
          <div className="name">{category.name}</div>
          <div className="meta">
            /{category.slug} · {plural(category.recipe_count, "recette")} dont {category.published_count} publiée{category.published_count > 1 ? "s" : ""} · {category.dietetic_count} diététique
            {category.dietetic_count > 1 ? "s" : ""}
          </div>
        </div>
      )}
      <div className="actions">
        {editing ? (
          <>
            <Button small variant="primary" onClick={submit}>
              Enregistrer
            </Button>
            <Button
              small
              variant="quiet"
              onClick={() => {
                setEditing(false);
                setName(category.name);
                setError(null);
              }}
            >
              Annuler
            </Button>
          </>
        ) : (
          <>
            <Button small variant="quiet" onClick={() => setEditing(true)} aria-label={`Renommer « ${category.name} »`}>
              Renommer
            </Button>
            <Button small variant="quiet" danger onClick={onDelete} aria-label={`Supprimer « ${category.name} »`}>
              Supprimer
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export default function Categories() {
  const client = useQueryClient();
  const toast = useToast();
  const { data, isPending, error } = useAdminCategories();
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<CategoryAdmin | null>(null);
  const [blocked, setBlocked] = useState<{ category: CategoryAdmin; message: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const refresh = () => invalidateAfterChange(client);

  const create = useMutation({
    mutationFn: (name: string) => categoryApi.create(name),
    onSuccess: (category) => {
      setNewName("");
      setCreateError(null);
      refresh();
      toast.show(`Catégorie « ${category.name} » créée.`);
    },
    onError: (e) => setCreateError(e instanceof ApiError ? (e.errors[0]?.message ?? e.detail) : errorMessage(e)),
  });

  const reorder = useMutation({
    mutationFn: (ids: number[]) => categoryApi.reorder(ids),
    onMutate: (ids) => {
      const previous = client.getQueryData<CategoryAdmin[]>(adminKeys.categories);
      if (previous) client.setQueryData(adminKeys.categories, ids.map((id) => previous.find((c) => c.id === id)!));
      return { previous };
    },
    onError: (e, _, context) => {
      if (context?.previous) client.setQueryData(adminKeys.categories, context.previous);
      toast.error(errorMessage(e));
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (category: CategoryAdmin) => categoryApi.remove(category.id),
    onSuccess: (_, category) => {
      setToDelete(null);
      refresh();
      toast.show(`Catégorie « ${category.name} » supprimée.`);
    },
    onError: (e, category) => {
      setToDelete(null);
      if (e instanceof ApiError && e.status === 409) setBlocked({ category, message: e.detail });
      else toast.error(errorMessage(e));
    },
  });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!data || !over || active.id === over.id) return;
    const from = data.findIndex((c) => c.id === active.id);
    const to = data.findIndex((c) => c.id === over.id);
    reorder.mutate(arrayMove(data, from, to).map((c) => c.id));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Catégories</h1>
          <p>L'ordre ci-dessous est celui de l'accueil et des filtres. Glissez les poignées, ou utilisez Espace puis les flèches.</p>
        </div>
      </div>

      <section className="panel">
        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newName.trim()) return setCreateError("Donnez un nom à la catégorie.");
            create.mutate(newName.trim());
          }}
        >
          <div className="field" style={{ flex: "1 1 260px", maxWidth: 420 }}>
            <label className="label" htmlFor="new-category">
              Nouvelle catégorie
            </label>
            <Input
              id="new-category"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setCreateError(null);
              }}
              placeholder="Desserts glacés"
              aria-invalid={Boolean(createError)}
              aria-describedby={createError ? "new-category-error" : undefined}
            />
            {createError && (
              <p className="field-error" id="new-category-error" role="alert">
                {createError}
              </p>
            )}
          </div>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            Créer
          </Button>
        </form>

        {error && (
          <p className="empty-row" role="alert">
            {errorMessage(error)}
          </p>
        )}
        {isPending ? (
          <div style={{ padding: 24, display: "grid", gap: 20 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} line style={{ height: 24, width: `${30 + i * 8}%` }} />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={data?.map((c) => c.id) ?? []} strategy={verticalListSortingStrategy}>
              <ul className="cat-list">
                {data?.map((category) => (
                  <CategoryItem
                    key={category.id}
                    category={category}
                    onRename={async (name) => {
                      const updated = await categoryApi.rename(category.id, name);
                      refresh();
                      toast.show(updated.slug === category.slug ? "Catégorie renommée." : `Catégorie renommée ; nouvelle adresse /${updated.slug}.`);
                    }}
                    onDelete={() => setToDelete(category)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        {data && data.length === 0 && <p className="empty-row">Aucune catégorie. Créez-en une : chaque recette doit appartenir à une catégorie.</p>}
      </section>

      <ConfirmDialog
        open={toDelete != null}
        title={`Supprimer « ${toDelete?.name ?? ""} » ?`}
        message={
          toDelete && toDelete.recipe_count > 0
            ? `${plural(toDelete.recipe_count, "recette")} y ${toDelete.recipe_count > 1 ? "sont rattachées" : "est rattachée"} : la suppression sera refusée tant qu'elles n'auront pas changé de catégorie.`
            : "La catégorie ne contient aucune recette : elle disparaîtra de l'accueil et des filtres."
        }
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
      <Dialog
        open={blocked != null}
        onClose={() => setBlocked(null)}
        title={`« ${blocked?.category.name ?? ""} » ne peut pas être supprimée`}
        actions={
          <Button variant="primary" onClick={() => setBlocked(null)}>
            Compris
          </Button>
        }
      >
        <p>{blocked?.message}</p>
      </Dialog>
    </>
  );
}
