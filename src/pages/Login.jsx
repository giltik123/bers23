import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { coreClient } from "@/api/coreClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useTranslation } from "@/lib/i18n/TranslationProvider";
import GoogleIcon from "@/components/GoogleIcon";

const GOOGLE_AUTH_ENABLED = (import.meta.env ?? {}).VITE_GOOGLE_AUTH_ENABLED === "true";

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // React's disabled state may not render before a second submit event.
  // Core remains the sole session authority; this only serializes UI intent.
  const requestInFlight = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setError("");
    setLoading(true);
    try {
      await coreClient.auth.loginViaEmailPassword(email, password);
      window.location.href = "/";
    } catch (err) {
      // Do not echo server/provider details into the public sign-in screen.
      if (err?.status === 400 || err?.status === 401 || err?.status === 403) {
        setError(t("authUi.invalidLogin"));
      } else {
        setError(t(typeof err?.status === "number" ? "errors.generic" : "errors.network"));
      }
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setError("");
    setLoading(true);
    try {
      // A successful call navigates away; keep controls locked until it does.
      coreClient.auth.loginWithProvider("google", "/");
    } catch (err) {
      setError(t(typeof err?.status === "number" ? "errors.generic" : "errors.network"));
      requestInFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title={t("authUi.welcome")}
      subtitle={t("authUi.loginHint")}
      footer={
        <>
          {t("authUi.noAccount")}{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            {t("authUi.createOne")}
          </Link>
        </>
      }
    >
      {GOOGLE_AUTH_ENABLED && (
        <>
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium mb-6"
            onClick={handleGoogle}
            disabled={loading}
          >
            <GoogleIcon className="w-5 h-5 mr-2" />
            {t("authUi.continueGoogle")}
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">{t("authUi.or")}</span>
            </div>
          </div>
        </>
      )}

      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
        <div className="space-y-2">
          <Label htmlFor="email">{t("authUi.email")}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("authUi.password")}</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              {t("authUi.forgot")}
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("authUi.loggingIn")}
            </>
          ) : (
            t("authUi.login")
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
