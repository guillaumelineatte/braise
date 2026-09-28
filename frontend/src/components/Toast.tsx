import { AnimatePresence, m } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";

type Tone = "info" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}
interface ToastApi {
  show: (message: string, options?: { tone?: Tone; action?: ToastItem["action"]; duration?: number }) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    (message, { tone = "info", action, duration } = {}) => {
      const id = ++counter.current;
      setItems((all) => [...all.slice(-2), { id, message, tone, action }]);
      window.setTimeout(() => dismiss(id), duration ?? (tone === "error" ? 7000 : 4000));
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ show, error: (message) => show(message, { tone: "error" }) }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((toast) => (
              <m.div
                key={toast.id}
                layout
                className={cx("toast", toast.tone === "error" && "--error")}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <span>{toast.message}</span>
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      dismiss(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                )}
                <button type="button" onClick={() => dismiss(toast.id)} aria-label="Fermer le message">
                  ×
                </button>
              </m.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast doit être utilisé sous <ToastProvider>.");
  return context;
}
