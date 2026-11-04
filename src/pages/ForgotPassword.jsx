import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { coreClient } from "@/api/coreClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useTranslation } from "@/lib/i18n/TranslationProvider";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setLoading(true);
    try {
      await coreClient.auth.resetPasswordRequest(email);
      setSent(true);
    } catch (err) {
      // An HTTP response must not reveal whether this email has an account.
      // A transport failure has no server response and can be retried safely.
      if (typeof err?.status === "number") setSent(true);
      else setError(t("errors.network"));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title={t("authUi.resetTitle")}
      subtitle={t("authUi.resetHint")}
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />{t("authUi.backToLogin")}
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-foreground text-center">
          {t("authUi.resetSent")}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="email">{t("authUi.emailAddress")}</Label>
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
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("authUi.sending")}
              </>
            ) : (
              t("authUi.sendReset")
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
