import { cx } from "@/lib/cx";

interface StepProps {
  number: number;
  content: string;
  done: boolean;
  onToggle: () => void;
}

// à mettre dans un <ol> : le gros numéro est juste décoratif
export function Step({ number, content, done, onToggle }: StepProps) {
  return (
    <li className={cx("step", done && "done")}>
      <span className="num" aria-hidden="true">
        {number}
      </span>
      <p>{content}</p>
      <button
        type="button"
        className="check"
        aria-pressed={done}
        aria-label={`Marquer l'étape ${number} comme faite`}
        onClick={onToggle}
      />
    </li>
  );
}
