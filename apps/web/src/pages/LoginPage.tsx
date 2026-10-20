import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@livestock/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';

/**
 * Sign-in screen. The illustration is laid out at its native aspect ratio and scaled to cover the
 * viewport; on wide screens the card sits exactly where the prototype places it.
 */
function useIsWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function LoginPage() {
  const wide = useIsWide();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const e = form.formState.errors;

  if (user) return <Navigate to={(location.state as { from?: string })?.from ?? '/'} replace />;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await login(v.email, v.password);
      navigate((location.state as { from?: string })?.from ?? '/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : navigator.onLine
            ? 'Unable to sign in. Please try again.'
            : 'You are offline. Connect to sign in.',
      );
    }
  });

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#f3f4ec]">
      {/* Background scaled like object-fit: cover, keeping the 1634×1014 artwork proportions */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: 'max(100vw, calc(100dvh * 1.6114))', height: 'max(100dvh, calc(100vw / 1.6114))' }}
      >
        <picture>
          <source media="(max-width: 900px)" srcSet="/login-bg-sm.jpg" />
          <img
            src="/login-bg.jpg"
            alt=""
            className="h-full w-full select-none object-cover"
            draggable={false}
          />
        </picture>
        {/* Card anchored to the artwork on large screens */}
        {wide && (
          <div className="absolute" style={{ left: '31.5%', top: '16.1%', width: '33.45%', height: '65.8%' }}>
            <LoginCard {...{ form, onSubmit, e, show, setShow, error }} className="h-full w-full" />
          </div>
        )}
      </div>
      {/* Small screens: centred card */}
      {!wide && (
        <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-4 py-10">
          <LoginCard {...{ form, onSubmit, e, show, setShow, error }} className="w-full max-w-[440px]" />
        </div>
      )}
    </div>
  );
}

function LoginCard({
  form,
  onSubmit,
  e,
  show,
  setShow,
  error,
  className,
}: {
  form: ReturnType<typeof useForm<LoginInput>>;
  onSubmit: () => void;
  e: Record<string, { message?: string } | undefined>;
  show: boolean;
  setShow: (v: boolean) => void;
  error: string | null;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col justify-center rounded-[20px] border border-white/70 bg-white/55 px-7 py-10 shadow-[0_8px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-[15%] ${className}`}
    >
      <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">Sign in</h1>
      <p className="mt-1 text-[14.5px] text-slate-600">Livestock Monitoring System with GIS Integration.</p>
      <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[15px] text-slate-800">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            {...form.register('email')}
            aria-invalid={!!e.email}
            className="bg-white"
          />
          {e.email && <p className="mt-1 text-[13px] text-red-600">{e.email.message}</p>}
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-[15px] text-slate-800">
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              {...form.register('password')}
              aria-invalid={!!e.password}
              className="bg-white pr-10"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {e.password && <p className="mt-1 text-[13px] text-red-600">{e.password.message}</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13.5px] text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="!mt-12 w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
