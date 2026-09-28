import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router";
import { cx } from "@/lib/cx";

type Variant = "default" | "primary" | "quiet";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  danger?: boolean;
  small?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", danger, small, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("btn", variant !== "default" && variant, danger && "danger", small && "small", className)}
      {...props}
    />
  );
});

export function ButtonLink({ variant = "default", small, className, ...props }: LinkProps & { variant?: Variant; small?: boolean }) {
  return <Link className={cx("btn", variant !== "default" && variant, small && "small", className)} {...props} />;
}
