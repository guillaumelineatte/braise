import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Textarea } from "@/components/Input";
import { cx } from "@/lib/cx";
import { restrictToVerticalAxis } from "@/lib/dnd";
import { splitSteps } from "@/lib/steps";
import { emptyStep, newKey, type EditorValues } from "./editorForm";

function StepBlock({ form, index, id, onRemove }: { form: UseFormReturn<EditorValues>; index: number; id: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const uid = useId();
  const error = form.formState.errors.steps?.[index]?.content;
  const registration = form.register(`steps.${index}.content`);
  return (
    <div ref={setNodeRef} className={cx("step-block", isDragging && "is-dragging")} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" ref={setActivatorNodeRef} className="handle" aria-label={`Déplacer l'étape ${index + 1}`} {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <span className="num" aria-hidden="true">
        {index + 1}
      </span>
      <div>
        <label className="sr-only" htmlFor={`${uid}-step`}>
          Étape {index + 1}
        </label>
        <Textarea
          id={`${uid}-step`}
          placeholder="Décrivez le geste, et pourquoi il compte."
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${uid}-error` : undefined}
          {...registration}
        />
        {error && (
          <p className="field-error" id={`${uid}-error`}>
            {error.message}
          </p>
        )}
      </div>
      <button type="button" className="remove" onClick={onRemove} aria-label={`Retirer l'étape ${index + 1}`}>
        ×
      </button>
    </div>
  );
}

export function StepsEditor({ form }: { form: UseFormReturn<EditorValues> }) {
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "steps", keyName: "fieldId" });
  // pas replace() : il ne déclenche pas watch, donc pas d'autosave
  const replace = (rows: { key: string; content: string }[]) => form.setValue("steps", rows, { shouldDirty: true, shouldValidate: true });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const parsed = splitSteps(text);
  const hasContent = form.getValues("steps").some((s) => s.content.trim());

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      fields.findIndex((f) => f.fieldId === active.id),
      fields.findIndex((f) => f.fieldId === over.id),
    );
  };

  const applyPaste = (mode: "replace" | "append") => {
    const rows = parsed.map((content) => ({ key: newKey(), content }));
    if (mode === "replace" || !hasContent) replace(rows);
    else {
      const kept = form.getValues("steps").filter((s) => s.content.trim());
      replace([...kept, ...rows]);
    }
    setPasting(false);
    setText("");
  };

  return (
    <div className="list-gap">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={fields.map((f) => f.fieldId)} strategy={verticalListSortingStrategy}>
          <div>
            {fields.map((field, index) => (
              <StepBlock
                key={field.fieldId}
                id={field.fieldId}
                form={form}
                index={index}
                onRemove={() => (fields.length === 1 ? replace([emptyStep()]) : remove(index))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="add-row">
        <button
          type="button"
          onClick={() => {
            append(emptyStep(), { shouldFocus: false });
            window.setTimeout(() => {
              const areas = document.querySelectorAll<HTMLTextAreaElement>(".step-block textarea");
              areas[areas.length - 1]?.focus();
            }, 30);
          }}
        >
          Ajouter une étape
        </button>
        <button type="button" className="--plain" onClick={() => setPasting(true)}>
          Coller un texte…
        </button>
      </div>

      <Dialog
        open={pasting}
        onClose={() => setPasting(false)}
        title="Coller un texte"
        className="--wide"
        actions={
          <>
            <Button onClick={() => setPasting(false)}>Annuler</Button>
            {hasContent && (
              <Button disabled={!parsed.length} onClick={() => applyPaste("append")}>
                Ajouter à la suite
              </Button>
            )}
            <Button variant="primary" disabled={!parsed.length} onClick={() => applyPaste("replace")}>
              {hasContent ? "Remplacer les étapes" : "Créer les étapes"}
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: 16 }}>Collez la méthode : elle est découpée par numérotation (1., 1), Étape 1) ou, à défaut, par ligne.</p>
        <label className="sr-only" htmlFor="paste-steps">
          Texte à découper
        </label>
        <textarea
          id="paste-steps"
          className="input"
          style={{ minHeight: 180, border: "1px solid var(--line-strong)", padding: 12, borderRadius: 2, overflow: "auto", resize: "vertical" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"1. Préchauffez le four à 180 °C.\n2. Beurrez le moule…"}
        />
        <p className="field-hint" style={{ marginTop: 10 }} aria-live="polite">
          {parsed.length ? `${parsed.length} étape${parsed.length > 1 ? "s" : ""} détectée${parsed.length > 1 ? "s" : ""}.` : "Aucune étape détectée pour l'instant."}
        </p>
      </Dialog>
    </div>
  );
}
