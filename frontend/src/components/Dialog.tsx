import { AnimatePresence, m } from "framer-motion";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";
import { Button } from "./Button";

const EASE = [0.16, 1, 0.3, 1] as const;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// garde le focus dans la modale, ferme sur Échap, et rend le focus au bouton d'origine
function useFocusTrap(open: boolean, container: RefObject<HTMLElement | null>, onClose: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? container.current?.querySelector<HTMLElement>(FOCUSABLE) ?? container.current;
      target?.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !container.current) return;
      const items = [...container.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, container, initialFocus]);
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

export function Dialog({ open, onClose, title, children, actions, initialFocus, className }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(open, ref, onClose, initialFocus);
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <m.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            className={cx("dialog", className)}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <h2 className="serif h4" id={`${id}-title`}>
              {title}
            </h2>
            {children}
            {actions && <div className="actions">{actions}</div>}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  busy?: boolean;
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel, danger, busy }: ConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      initialFocus={cancelRef}
      actions={
        <>
          <Button ref={cancelRef} onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="primary" danger={danger} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  // false pour l'aperçu de l'éditeur : pas de voile, on peut continuer à éditer
  modal?: boolean;
}

// panneau qui sort de la droite (filtres sur mobile, aperçu dans l'admin)
export function Drawer({ open, onClose, title, children, footer, wide, modal = true }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(open && modal, ref, onClose);
  return createPortal(
    <AnimatePresence>
      {open && modal && (
        <m.div
          key="overlay"
          className="drawer-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
        />
      )}
      {open && (
        <m.aside
          key="drawer"
          ref={ref}
          role={modal ? "dialog" : "complementary"}
          aria-modal={modal || undefined}
          aria-labelledby={`${id}-title`}
          className={cx("drawer", wide && "--wide", !modal && "--docked")}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="drawer-head">
            <h2 className="label" id={`${id}-title`} style={{ margin: 0 }}>
              {title}
            </h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer le panneau">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
          <div className="drawer-body">{children}</div>
          {footer}
        </m.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}
