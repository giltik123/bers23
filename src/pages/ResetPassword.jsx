import React, { useState } from "react";
import { Link } from "react-router-dom";
import { coreClient } from "@/api/coreClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useTranslation } from "@/lib/i18n/TranslationProvider";

function takeResetToken() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash);
  const token = params.get("token");
  if (token) {
    params.delete("token");
    const cleanHash = params.toString() ? `#${params.toString()}` : "";
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}${cleanHash}`);
  }
  return token;
}

export default function ResetPassword() {
  const { t } = useTranslation();
  const [resetToken] = useState(takeResetToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError(t("authUi.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      await coreClient.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || t("authUi.resetFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title={t("authUi.invalidLink")}
        subtitle={t("authUi.invalidLinkHint")}
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            {t("authUi.requestNewLink")}
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          {t("authUi.invalidLinkHelp")}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title={t("authUi.newPassword")}
      subtitle={t("authUi.newPasswordHint")}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t("authUi.newPassword")}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t("authUi.confirmPassword")}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("authUi.resetting")}
            </>
          ) : (
            t("authUi.resetTitle")
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
