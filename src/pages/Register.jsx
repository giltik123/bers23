import React, { useState } from "react";
import { Link } from "react-router-dom";
import { coreClient } from "@/api/coreClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import { useTranslation } from "@/lib/i18n/TranslationProvider";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";

const GOOGLE_AUTH_ENABLED = (import.meta.env ?? {}).VITE_GOOGLE_AUTH_ENABLED === "true";

export default function Register() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verificationHandle, setVerificationHandle] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(t("authUi.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const result = await coreClient.auth.register({ email, password });
      setVerificationHandle(result?.verification_handle || "");
      setShowOtp(true);
    } catch (err) {
      setError(err.message || t("authUi.registrationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      await coreClient.auth.verifyOtp({ email, otpCode, verificationHandle });
      window.location.href = "/";
    } catch (err) {
      setError(err.message || t("authUi.invalidCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await coreClient.auth.resendOtp(email, verificationHandle);
      toast({ title: t("authUi.codeSent"), description: t("authUi.codeSentHint") });
    } catch (err) {
      setError(err.message || t("authUi.resendFailed"));
    }
  };

  const handleGoogle = () => coreClient.auth.loginWithProvider("google", "/");

  if (showOtp) {
    return (
      <AuthLayout icon={Mail} title={t("authUi.verifyEmail")} subtitle={t("authUi.sentCode", { email })}>
        {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
        <div className="flex justify-center mb-6">
          <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
            <InputOTPGroup>
              <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
              <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button className="w-full h-12 font-medium" onClick={handleVerify} disabled={loading || otpCode.length < 6 || !verificationHandle}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("authUi.verifying")}</> : t("authUi.verify")}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          {t("authUi.resendPrompt")}{" "}<button onClick={handleResend} className="text-primary font-medium hover:underline">{t("authUi.resend")}</button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={UserPlus} title={t("authUi.createAccount")} subtitle={t("authUi.signupHint")} footer={<>{t("authUi.hasAccount")}{" "}<Link to="/login" className="text-primary font-medium hover:underline">{t("authUi.login")}</Link></>}>
      {GOOGLE_AUTH_ENABLED && (
        <>
          <Button variant="outline" className="w-full h-12 text-sm font-medium mb-6" onClick={handleGoogle}>
            <GoogleIcon className="w-5 h-5 mr-2" />{t("authUi.continueGoogle")}
          </Button>
          <div className="relative mb-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">{t("authUi.or")}</span></div></div>
        </>
      )}
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="email">{t("authUi.email")}</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" /><Input id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required /></div></div>
        <div className="space-y-2"><Label htmlFor="password">{t("authUi.password")}</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" /><Input id="password" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12" required /></div></div>
        <div className="space-y-2"><Label htmlFor="confirm">{t("authUi.confirmPassword")}</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" /><Input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 h-12" required /></div></div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("authUi.creatingAccount")}</> : t("authUi.registerSubmit")}</Button>
      </form>
    </AuthLayout>
  );
}
