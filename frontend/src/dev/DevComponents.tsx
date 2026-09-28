import { useState } from "react";
import { useCategories, useFeatured } from "@/api/public";
import { Button } from "@/components/Button";
import { Card, CardSkeleton } from "@/components/Card";
import { CategoryRow } from "@/components/CategoryRow";
import { ConfirmDialog } from "@/components/Dialog";
import { DietMark } from "@/components/DietMark";
import { Field, Input, Textarea } from "@/components/Input";
import { Label } from "@/components/Label";
import { NutritionBlock } from "@/components/NutritionBlock";
import { Photo } from "@/components/Photo";
import { Select } from "@/components/Select";
import { Skeleton } from "@/components/Skeleton";
import { Step } from "@/components/Step";
import { Stepper } from "@/components/Stepper";
import { useToast } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { WordmarkText } from "@/components/Wordmark";
import { UNIT_OPTIONS } from "@/lib/format";
import { useMeta } from "@/lib/meta";

// page de dev pour voir tous les composants, thème clair et sombre côte à côte
function Board({ theme }: { theme: "light" | "dark" }) {
  const featured = useFeatured();
  const categories = useCategories();
  const toast = useToast();
  const [servings, setServings] = useState(4);
  const [diet, setDiet] = useState(true);
  const [unit, setUnit] = useState<string>("G");
  const [done, setDone] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState("Olives vertes dénoyautées");

  return (
    <div data-theme={theme} style={{ padding: 32, display: "grid", gap: 48, alignContent: "start" }}>
      <p className="label">Thème {theme === "light" ? "clair" : "sombre"}</p>

      <section style={{ display: "grid", gap: 16 }}>
        <p className="wordmark">
          <WordmarkText />
        </p>
        <h1 className="serif display" style={{ margin: 0 }}>
          Display
        </h1>
        <h2 className="serif h1" style={{ margin: 0 }}>
          Titre h1
        </h2>
        <h3 className="serif h2" style={{ margin: 0, fontStyle: "italic", fontWeight: 300 }}>
          Titre h2 italique
        </h3>
        <p className="serif h3" style={{ margin: 0 }}>
          Titre h3
        </p>
        <p className="lede" style={{ margin: 0 }}>
          Une volaille entière, une heure de four, et le jus qui fait tout.
        </p>
        <p style={{ margin: 0 }}>Texte courant en Inter 17 px, interlignage 1,6.</p>
        <p className="meta" style={{ margin: 0 }}>
          45 min — 4 portions — <DietMark />
        </p>
        <Label>Libellé</Label>
        <p style={{ margin: 0, display: "flex", gap: 20 }}>
          <a href="#dev" className="u">
            Lien souligné
          </a>
          <span className="small" style={{ color: "var(--accent-text)" }}>
            Accent en petit texte
          </span>
        </p>
      </section>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button>Aperçu</Button>
        <Button variant="primary">Publier</Button>
        <Button variant="quiet">Annuler</Button>
        <Button danger onClick={() => setConfirm(true)}>
          Supprimer…
        </Button>
        <Button small onClick={() => toast.show("Recette enregistrée.")}>
          Notification
        </Button>
        <Button small onClick={() => toast.error("Erreur d'enregistrement — réessayez.")}>
          Erreur
        </Button>
      </section>

      <section style={{ display: "grid", gap: 24, maxWidth: 520 }}>
        <Toggle label="Diététique" description="Affiche la recette dans l'option Diététique de sa catégorie." checked={diet} onChange={setDiet} />
        <Toggle label="En avant" tone="accent" description="Remplace la recette de la semaine." checked={!diet} onChange={(v) => setDiet(!v)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 96px 200px", gap: 16, alignItems: "end" }}>
          <Field label="Ingrédient">{({ id }) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <Field label="Quantité">{({ id }) => <Input id={id} className="tnum" defaultValue="120" inputMode="decimal" />}</Field>
          <div className="field">
            <span className="label" id={`unit-${theme}`}>
              Unité
            </span>
            <Select labelledBy={`unit-${theme}`} value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
          </div>
        </div>
        <Field label="Description" error="Ajoutez une description.">
          {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} defaultValue="" />}
        </Field>
        <div className="warn">
          <span>Les macros donnent 512 kcal, soit 16 % de moins que la valeur saisie.</span>
          <button type="button">Corriger à 512</button>
        </div>
      </section>

      <section style={{ display: "grid", gap: 24, maxWidth: 420 }}>
        <div className="serv">
          <h2 className="h4">Ingrédients</h2>
          <Stepper value={servings} onChange={setServings} />
        </div>
        <NutritionBlock nutrition={{ calories: 512, protein_g: 42, carbs_g: 14, fat_g: 32 }} />
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Step number={1} content="Sortez le poulet une heure avant. Séchez la peau avec soin." done={done} onToggle={() => setDone(!done)} />
        </ol>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {featured.data ? <Card recipe={featured.data} sizes="30vw" /> : <CardSkeleton />}
        <CardSkeleton ratio="4/3" />
        <Photo tone="b" style={{ aspectRatio: "4/3" }} reveal={false} />
        <Photo tone="d" style={{ aspectRatio: "4/3" }} reveal={false} />
      </section>

      <section>{categories.data?.slice(0, 2).map((c) => <CategoryRow key={c.id} category={c} />)}</section>

      <section style={{ display: "grid", gap: 10 }}>
        <Skeleton style={{ aspectRatio: "16/5" }} />
        <Skeleton line style={{ width: "60%" }} />
        <Skeleton line style={{ width: "40%" }} />
      </section>

      <ConfirmDialog
        open={confirm}
        title="Supprimer « Poulet rôti » ?"
        message="La recette, ses ingrédients et ses étapes seront supprimés. L'image reste disponible."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

export default function DevComponents() {
  useMeta({ title: "Composants", noindex: true });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(520px, 1fr))", minHeight: "100vh" }}>
      <Board theme="light" />
      <Board theme="dark" />
    </div>
  );
}
