/** Brand mark: chicken, cow and pig heads in white line art. */
export function LogoGlyph({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* chicken */}
      <path d="M8 13c0-2 1.6-3 3-2.4.6-1.6 2.8-1.6 3.4 0 1.6-.4 2.6 1.2 1.8 2.6" />
      <path d="M8.5 13.5c-1.6 1.6-1.6 5 0 7 1.4 1.8 4.4 2.2 6.4.6 1.6-1.2 2-3.4 1.4-5.2" />
      <path d="M16.3 15.6l2 .9-2 .8" />
      <circle cx="13" cy="15.6" r=".5" fill="currentColor" />
      {/* cow */}
      <path d="M22 12.5c-1.8-.4-3 .6-3.2 1.6 1 .6 2.2.6 3.2-.2" />
      <path d="M38 12.5c1.8-.4 3 .6 3.2 1.6-1 .6-2.2.6-3.2-.2" />
      <path d="M22.3 11.5c.6-2.2 3.6-3.4 7.7-3.4s7.1 1.2 7.7 3.4c.6 2.6-.4 4.6-1.6 6.2-1.2 1.6-3.6 2.8-6.1 2.8s-4.9-1.2-6.1-2.8c-1.2-1.6-2.2-3.6-1.6-6.2z" />
      <ellipse cx="30" cy="17.4" rx="4" ry="2.3" />
      <circle cx="26.4" cy="12.8" r=".5" fill="currentColor" />
      <circle cx="33.6" cy="12.8" r=".5" fill="currentColor" />
      {/* pig */}
      <path d="M14.5 29.5l-1.8-3.2 3.6 1M33.5 29.5l1.8-3.2-3.6 1" />
      <path d="M24 26.5c-6 0-10 3.4-10 8s4 8 10 8 10-3.4 10-8-4-8-10-8z" />
      <ellipse cx="24" cy="36.5" rx="3.6" ry="2.4" />
      <path d="M22.8 36.4v.2M25.2 36.4v.2" />
      <circle cx="20" cy="32" r=".5" fill="currentColor" />
      <circle cx="28" cy="32" r=".5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
        <LogoGlyph className="h-7 w-7" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-white">Naga City Vet</div>
          <div className="text-xs text-white/70">Livestock Monitoring</div>
        </div>
      )}
    </div>
  );
}
