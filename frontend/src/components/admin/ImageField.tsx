import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { updateImageAlt, uploadImage, type Crop } from "@/api/admin";
import { errorMessage } from "@/api/client";
import type { ImageOut } from "@/api/schemas";
import { Button } from "@/components/Button";
import { Field, Input } from "@/components/Input";
import { Photo } from "@/components/Photo";
import { useToast } from "@/components/Toast";
import { cx } from "@/lib/cx";
import { useDebouncedValue } from "@/lib/hooks";

const RATIO = 5 / 4;
const MAX_BYTES = 12 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

interface CropperState {
  zoom: number;
  x: number; // position du coin haut-gauche de l'image dans le cadre (px à l'écran)
  y: number;
}

// recadrage en 5/4 : on glisse pour cadrer, slider ou +/- pour zoomer, flèches pour ajuster
function Cropper({ src, onChange }: { src: string; onChange: (crop: Crop) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<CropperState>({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const height = width / RATIO;
  const base = natural ? Math.max(width / natural.w, height / natural.h) : 1;
  const scale = base * state.zoom;
  const clamp = useCallback(
    (next: CropperState): CropperState => {
      if (!natural) return next;
      const s = base * next.zoom;
      const minX = width - natural.w * s;
      const minY = height - natural.h * s;
      return { zoom: next.zoom, x: Math.min(0, Math.max(minX, next.x)), y: Math.min(0, Math.max(minY, next.y)) };
    },
    [natural, base, width, height],
  );

  // on centre dès qu'on connaît la taille de l'image
  useEffect(() => {
    if (!natural || !width) return;
    const s = base;
    setState({ zoom: 1, x: (width - natural.w * s) / 2, y: (height - natural.h * s) / 2 });
  }, [natural, width]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!natural || !width) return;
    onChange({ x: -state.x / scale, y: -state.y / scale, w: width / scale, h: height / scale });
  }, [state, natural, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomTo = (zoom: number) => {
    const z = Math.min(3, Math.max(1, zoom));
    // on zoome depuis le centre du cadre
    const cx = width / 2;
    const cy = height / 2;
    const ratio = z / state.zoom;
    setState(clamp({ zoom: z, x: cx - (cx - state.x) * ratio, y: cy - (cy - state.y) * ratio }));
  };

  const onPointerDown = (event: PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { px: event.clientX, py: event.clientY, x: state.x, y: state.y };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag.current) return;
    setState(clamp({ zoom: state.zoom, x: drag.current.x + event.clientX - drag.current.px, y: drag.current.y + event.clientY - drag.current.py }));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setState(clamp({ ...state, x: state.x + dx, y: state.y + dy }));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo(state.zoom + 0.1);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomTo(state.zoom - 0.1);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
      <div
        ref={frame}
        className="cropper"
        tabIndex={0}
        role="group"
        aria-label="Cadrage de l'image (5/4). Glissez ou utilisez les flèches ; + et − pour zoomer."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      >
        <img
          src={src}
          alt=""
          onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
          style={natural ? { width: natural.w, height: natural.h, transform: `translate(${state.x}px, ${state.y}px) scale(${scale})` } : { opacity: 0 }}
        />
        <div className="grid-lines" aria-hidden="true" />
      </div>
      <label className="label" htmlFor="crop-zoom" style={{ display: "flex", justifyContent: "space-between" }}>
        Zoom <span className="tnum">{Math.round(state.zoom * 100)} %</span>
      </label>
      <input id="crop-zoom" className="range" type="range" min={1} max={3} step={0.01} value={state.zoom} onChange={(e) => zoomTo(Number(e.target.value))} />
    </div>
  );
}

interface ImageFieldProps {
  image: ImageOut | null;
  // appelé une fois l'upload fini, pour lier l'image à la recette
  onUploaded: (image: ImageOut) => Promise<void> | void;
  onRemove: () => void;
  // image locale affichée pendant l'upload (sert aussi à l'aperçu)
  onPreview?: (url: string | null) => void;
  missing?: boolean;
}

export function ImageField({ image, onUploaded, onRemove, onPreview, missing }: ImageFieldProps) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alt, setAlt] = useState(image?.alt ?? "");
  const debouncedAlt = useDebouncedValue(alt, 800);

  useEffect(() => setAlt(image?.alt ?? ""), [image?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!image || debouncedAlt === image.alt) return;
    updateImageAlt(image.id, debouncedAlt).catch((e) => toast.error(errorMessage(e)));
  }, [debouncedAlt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = (candidate: File | undefined) => {
    setError(null);
    if (!candidate) return;
    if (!TYPES.includes(candidate.type)) return setError("Format non pris en charge : JPEG, PNG ou WebP uniquement.");
    if (candidate.size > MAX_BYTES) return setError("Fichier trop lourd : 12 Mo au maximum.");
    const url = URL.createObjectURL(candidate);
    setFile(candidate);
    setPreview(url);
    onPreview?.(url);
  };

  const cancel = () => {
    setFile(null);
    setPreview(null);
    setProgress(null);
    onPreview?.(null);
  };

  const send = async () => {
    if (!file) return;
    setProgress(0);
    setError(null);
    try {
      const uploaded = await uploadImage(file, { alt, crop, onProgress: setProgress });
      setProgress(1);
      await onUploaded(uploaded);
      setAlt(uploaded.alt);
      setFile(null);
      setPreview(null);
      onPreview?.(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  const drop = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setOver(false);
      pick(event.dataTransfer.files[0]);
    },
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={TYPES.join(",")}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        pick(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
  );

  if (file && preview) {
    return (
      <div className="image-field">
        <Cropper src={preview} onChange={setCrop} />
        <div className="image-side">
          <p className="field-hint">
            Cadrez l'image au format de la page recette (5/4). Les vignettes des listes la recadreront au centre.
          </p>
          <Field label="Texte alternatif" hint="Ce que montre la photo, en une phrase. Laissez vide si elle est purement décorative.">
            {({ id, describedBy }) => <Input id={id} value={alt} onChange={(e) => setAlt(e.target.value)} aria-describedby={describedBy} maxLength={300} />}
          </Field>
          {progress != null && (
            <div className="upload-status" role="status">
              <span>{progress < 1 ? `Envoi… ${Math.round(progress * 100)} %` : "Traitement des variantes…"}</span>
              <div className="progress">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={send} disabled={progress != null}>
              Envoyer l'image
            </Button>
            <Button variant="quiet" onClick={cancel} disabled={progress != null}>
              Annuler
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (image) {
    return (
      <div className="image-field" {...drop}>
        <div style={{ position: "relative" }}>
          <Photo image={image} sizes="520px" reveal={false} className={cx(over && "is-over")} />
        </div>
        <div className="image-side">
          <Field label="Texte alternatif" hint="Enregistré automatiquement.">
            {({ id, describedBy }) => <Input id={id} value={alt} onChange={(e) => setAlt(e.target.value)} aria-describedby={describedBy} maxLength={300} />}
          </Field>
          <p className="field-hint">
            {image.width} × {image.height} px · variantes 320, 800 et 1600 px
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => input.current?.click()}>Remplacer…</Button>
            <Button variant="quiet" danger onClick={onRemove}>
              Retirer l'image
            </Button>
          </div>
          <p className="field-hint">Vous pouvez aussi déposer une nouvelle image sur la photo.</p>
        </div>
        {picker}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        className={cx("dropzone", over && "is-over")}
        role="button"
        tabIndex={0}
        aria-invalid={missing || undefined}
        style={missing ? { borderColor: "var(--danger)" } : undefined}
        onClick={() => input.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            input.current?.click();
          }
        }}
        {...drop}
      >
        <span>
          <strong>Déposez une photographie ici</strong>
          ou cliquez pour choisir un fichier — JPEG, PNG ou WebP, 12 Mo au maximum.
        </span>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {picker}
    </div>
  );
}
