import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@/lib/dnd";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId } from "react";
import { Controller, useFieldArray, type UseFormReturn } from "react-hook-form";
import { Select } from "@/components/Select";
import { cx } from "@/lib/cx";
import { UNIT_OPTIONS } from "@/lib/format";
import { Combobox } from "./Combobox";
import { emptyIngredient, type EditorValues } from "./editorForm";

interface RowProps {
  form: UseFormReturn<EditorValues>;
  index: number;
  id: string;
  onRemove: () => void;
  onEnterQuantity: () => void;
  count: number;
}

function IngredientRowEditor({ form, index, id, onRemove, onEnterQuantity, count }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const uid = useId();
  const errors = form.formState.errors.ingredients?.[index];
  const name = form.watch(`ingredients.${index}.name`);
  return (
    <div ref={setNodeRef} className={cx("ingrow", isDragging && "is-dragging")} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" ref={setActivatorNodeRef} className="handle" aria-label={`Déplacer l'ingrédient ${index + 1}${name ? ` (${name})` : ""}`} {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <div className="field">
        <label className="label" htmlFor={`${uid}-name`}>
          Ingrédient
        </label>
        <Controller
          control={form.control}
          name={`ingredients.${index}.name`}
          render={({ field }) => (
            <Combobox
              id={`${uid}-name`}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              invalid={Boolean(errors?.name)}
              describedBy={errors?.name ? `${uid}-name-error` : undefined}
              placeholder="Olives vertes dénoyautées"
              onEnter={() => document.getElementById(`${uid}-qty`)?.focus()}
            />
          )}
        />
        {errors?.name && (
          <p className="field-error" id={`${uid}-name-error`}>
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="field">
        <label className="label" htmlFor={`${uid}-qty`}>
          Quantité
        </label>
        <input
          id={`${uid}-qty`}
          className="input tnum"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={Boolean(errors?.quantity) || undefined}
          aria-describedby={errors?.quantity ? `${uid}-qty-error` : undefined}
          {...form.register(`ingredients.${index}.quantity`)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnterQuantity();
            }
          }}
        />
        {errors?.quantity && (
          <p className="field-error" id={`${uid}-qty-error`}>
            {errors.quantity.message}
          </p>
        )}
      </div>
      <div className="field">
        <span className="label" id={`${uid}-unit`}>
          Unité
        </span>
        <Controller
          control={form.control}
          name={`ingredients.${index}.unit`}
          render={({ field }) => <Select labelledBy={`${uid}-unit`} value={field.value} options={UNIT_OPTIONS} onChange={field.onChange} />}
        />
      </div>
      <button type="button" className="remove" onClick={onRemove} aria-label={`Retirer l'ingrédient ${index + 1}${name ? ` (${name})` : ""}`} disabled={count === 1 && !name}>
        ×
      </button>
    </div>
  );
}

export function IngredientsEditor({ form }: { form: UseFormReturn<EditorValues> }) {
  const { fields, append, remove, move, insert } = useFieldArray({ control: form.control, name: "ingredients", keyName: "fieldId" });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const focusName = (index: number) =>
    window.setTimeout(() => {
      const rows = document.querySelectorAll<HTMLInputElement>(".ingrow input[role='combobox']");
      rows[index]?.focus();
    }, 30);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      fields.findIndex((f) => f.fieldId === active.id),
      fields.findIndex((f) => f.fieldId === over.id),
    );
  };

  return (
    <div className="list-gap">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={fields.map((f) => f.fieldId)} strategy={verticalListSortingStrategy}>
          {fields.map((field, index) => (
            <IngredientRowEditor
              key={field.fieldId}
              id={field.fieldId}
              form={form}
              index={index}
              count={fields.length}
              onRemove={() => (fields.length === 1 ? form.setValue("ingredients.0", emptyIngredient(), { shouldDirty: true }) : remove(index))}
              onEnterQuantity={() => {
                insert(index + 1, emptyIngredient());
                focusName(index + 1);
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="add-row">
        <button
          type="button"
          onClick={() => {
            append(emptyIngredient(), { shouldFocus: false });
            focusName(fields.length);
          }}
        >
          Ajouter un ingrédient
        </button>
      </div>
    </div>
  );
}
