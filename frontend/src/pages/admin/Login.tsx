import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { login } from "@/api/admin";
import { ApiError, errorMessage } from "@/api/client";
import { LoginIn } from "@/api/schemas";
import { Button } from "@/components/Button";
import { Field, Input } from "@/components/Input";
import { WordmarkText } from "@/components/Wordmark";
import { saveSession, useSession } from "@/lib/auth";
import { useMeta } from "@/lib/meta";
import "@/styles/admin.css";

export default function Login() {
  useMeta({ title: "Connexion", noindex: true });
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const target = next && next.startsWith("/admin") ? next : "/admin";
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginIn>({ resolver: zodResolver(LoginIn), defaultValues: { email: "", password: "" } });

  if (session) return <Navigate to={target} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const token = await login(values.email.trim(), values.password);
      saveSession({ token: token.access_token, expiresAt: token.expires_at, email: values.email.trim().toLowerCase() });
      navigate(target, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Adresse ou mot de passe incorrect." : errorMessage(e));
    }
  });

  return (
    <main className="login">
      <form onSubmit={onSubmit} noValidate aria-labelledby="login-title">
        <div style={{ display: "grid", gap: 14 }}>
          <p className="wordmark" style={{ margin: 0 }}>
            <WordmarkText />
          </p>
          <h1 className="label" id="login-title" style={{ margin: 0 }}>
            Administration
          </h1>
        </div>
        <Field label="Adresse e-mail" error={formState.errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" autoComplete="username" autoFocus aria-describedby={describedBy} aria-invalid={invalid} {...register("email")} />
          )}
        </Field>
        <Field label="Mot de passe" error={formState.errors.password?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="current-password" aria-describedby={describedBy} aria-invalid={invalid} {...register("password")} />
          )}
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={formState.isSubmitting} style={{ height: 44 }}>
          {formState.isSubmitting ? "Connexion…" : "Se connecter"}
        </Button>
        <a href="/" className="small u" style={{ justifySelf: "start", color: "var(--ink-2)" }}>
          Retour au site
        </a>
      </form>
    </main>
  );
}
