import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

/** Client-side schema mirrors shared loginSchema (kept form-field friendly). */
const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
type FormValues = z.infer<typeof formSchema>;

/**
 * Login placeholder page — wires the form, store and API call.
 * When Supabase Auth is connected, POST /auth/login returns a real JWT.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const res = await api.post<{ accessToken: string; refreshToken: string; user: { id: string; email: string; role: string; orgId: string | null; branchId: string | null } }>(
        '/auth/login',
        values,
      );
      setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('auth.loginFailed'));
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-2 text-3xl">🏛️</div>
          <CardTitle className="text-xl font-bold text-teal-800">{t('app.name')}</CardTitle>
          <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" autoComplete="username" placeholder={t('auth.emailPlaceholder')} {...register('email')} />
              {errors.email && <p className="text-xs text-red-600">{t('auth.emailInvalid')}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" autoComplete="current-password" placeholder={t('auth.passwordPlaceholder')} {...register('password')} />
              {errors.password && <p className="text-xs text-red-600">{t('auth.passwordRequired')}</p>}
            </div>

            {serverError && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
            </Button>

            <p className="text-center text-xs text-muted-foreground">{t('auth.demoHint')}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
