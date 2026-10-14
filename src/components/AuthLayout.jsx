import React from 'react';
import { Sparkles, Image as ImageIcon, SlidersHorizontal, CheckCircle2 } from 'lucide-react';

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
        <aside className="hidden max-w-lg space-y-10 lg:block" aria-label="About BERS">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground" aria-hidden="true"><Sparkles className="h-6 w-6" /></span>
            <div>
              <p className="text-xl font-bold tracking-tight">BERS</p>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Creative studio</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Your creative workspace</p>
            <h2 className="mt-3 text-5xl font-semibold leading-tight tracking-tight">Make more from every image.</h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">Create projects, choose a focused edit and preview changes before you save. A more understandable way to work with your photos.</p>
          </div>
          <div className="space-y-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3"><ImageIcon className="mt-1 h-5 w-5 text-primary" aria-hidden="true" /><p className="text-sm"><strong>Upload a photo</strong><span className="mt-1 block text-muted-foreground">Your image stays at the center of the workspace.</span></p></div>
            <div className="flex items-start gap-3"><SlidersHorizontal className="mt-1 h-5 w-5 text-primary" aria-hidden="true" /><p className="text-sm"><strong>Choose an edit</strong><span className="mt-1 block text-muted-foreground">Tools appear when they are relevant.</span></p></div>
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-5 w-5 text-primary" aria-hidden="true" /><p className="text-sm"><strong>Review and save</strong><span className="mt-1 block text-muted-foreground">Keep a result only when it looks right.</span></p></div>
          </div>
        </aside>

        <main className="mx-auto w-full max-w-md space-y-6">
          <div className="text-center lg:text-left">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
              <Icon className="h-6 w-6" />
            </div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary lg:hidden">BERS creative studio</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-lg sm:p-8">
            {children}
          </div>
          {footer && <p className="text-center text-sm text-muted-foreground">{footer}</p>}
        </main>
      </div>
    </div>
  );
}
