'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, AlertCircle, CheckCircle2, Copy, ExternalLink, Lock, RefreshCw, Loader2, Clock, RotateCcw, Settings } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useI18n, useTranslations } from '@/components/providers/i18n-provider';
import { useSession } from '@/components/providers/session-provider';
import { listScripts, type ScriptSummary } from '@/lib/api/scripts';
import { createPaymentLink, getPaymentBrickStatus, type CreatePaymentLinkPayload, type PaymentBrickStatus } from '@/lib/api/payments';
import { getApiBaseUrl } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';

interface UnifiedPaymentBrickProps {
  id: string;
  content: {
    title?: string;
    description?: string | null;
    amount?: number;
    currency?: string;
    provider?: 'stripe' | 'paypal' | 'mercadopago';
    connectionId?: string | null;
    externalProductId?: string | null;
    checkoutUrl?: string | null;
    status?: 'pending' | 'paid' | 'failed' | 'refunded';
    paidAt?: string | null;
    payerEmail?: string | null;
    webhookUrl?: string | null;
    scriptId?: string | null;
    credentialsLocked?: boolean;
    credentialsLastUpdatedAt?: string | null;
  };
  canEdit: boolean;
  onUpdate: (content: any) => void;
  readonly?: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  mercadopago: 'MercadoPago',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  ARS: '$',
  MXN: '$',
  BRL: 'R$',
  PEN: 'S/',
};

/** Only https: links are rendered/clickable (blocks javascript:, data:, http:). */
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'paid') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-600" />;
  // 'refunded' is display-only: refunds are not implemented, so nothing in the app sets it.
  if (status === 'refunded') return <RotateCcw className="w-4 h-4 text-blue-600" />;
  return <Clock className="w-4 h-4 text-amber-600" />;
};

export function UnifiedPaymentBrick({
  id,
  content,
  canEdit,
  onUpdate,
  readonly = false,
}: UnifiedPaymentBrickProps) {
  const t = useTranslations('document-detail');
  const { activeTeamId, accessToken } = useSession();
  const { locale } = useI18n();
  const routeParams = useParams() as { path?: string | string[]; docId?: string; id?: string } | null;
  // Document routes are /d/[...path] (first segment = document id); public/other routes use docId or id.
  const routePath = routeParams?.path;
  const documentId = (Array.isArray(routePath) ? routePath[0] : routePath) || routeParams?.docId || routeParams?.id || undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [teamScripts, setTeamScripts] = useState<ScriptSummary[]>([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: content.title || '',
    description: content.description || '',
    amount: content.amount || 0,
    currency: content.currency || 'USD',
    provider: content.provider || 'stripe',
    connectionId: content.connectionId || '',
    checkoutUrl: content.checkoutUrl || '',
  });

  const webhookBase = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.NEXT_PUBLIC_KILLIO_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000'
    ).replace(/\/+$/, '');
  }, []);

  // URL the workspace admin pastes in the provider dashboard (Stripe / PayPal / MercadoPago webhooks).
  const providerWebhookUrl = activeTeamId
    ? `${getApiBaseUrl()}/webhooks/payments/${formData.provider}/${encodeURIComponent(activeTeamId)}`
    : '';
  const [isWebhookCopied, setIsWebhookCopied] = useState(false);

  // Server-confirmed status polled while the brick is pending (the browser never decides it).
  const [liveStatus, setLiveStatus] = useState<PaymentBrickStatus | null>(null);

  const webhookScripts = useMemo(() => {
    return teamScripts.filter((script) => {
      const publicToken = script.triggerConfig?.publicToken;
      return script.triggerType === 'webhook' && script.isActive && typeof publicToken === 'string' && publicToken.length > 0;
    });
  }, [teamScripts]);

  useEffect(() => {
    if (isEditing && activeTeamId && accessToken) {
      setIsLoadingScripts(true);
      listScripts(activeTeamId, accessToken)
        .then(setTeamScripts)
        .catch((err) => {
          console.error('Error loading scripts:', err);
        })
        .finally(() => setIsLoadingScripts(false));
    }
  }, [isEditing, activeTeamId, accessToken]);

  const handleSave = async () => {
    setIsSaving(true);

    let checkoutUrl = formData.checkoutUrl.trim();
    let externalProductId = content.externalProductId ?? null;

    if (checkoutUrl && !isHttpsUrl(checkoutUrl)) {
      toast(t('payment.form.checkoutUrlInvalid'), 'error');
      setIsSaving(false);
      return;
    }

    if (!checkoutUrl && formData.amount > 0 && accessToken && documentId) {
      try {
        const payload: CreatePaymentLinkPayload = {
          documentId,
          brickId: id,
          title: formData.title,
          description: formData.description || undefined,
          amount: formData.amount,
          currency: formData.currency,
          provider: formData.provider,
          connectionId: formData.connectionId || undefined,
        };

        const paymentLink = await createPaymentLink(payload, accessToken);
        checkoutUrl = isHttpsUrl(paymentLink.checkoutUrl) ? paymentLink.checkoutUrl : '';
        externalProductId = paymentLink.externalProductId ?? null;
      } catch (error) {
        console.error('Error generating payment link:', error);
        toast(t('payment.form.linkError'), 'error');
      }
    }

    onUpdate({
      ...content,
      title: formData.title,
      description: formData.description,
      amount: formData.amount,
      currency: formData.currency,
      provider: formData.provider,
      connectionId: formData.connectionId,
      checkoutUrl: checkoutUrl || content.checkoutUrl || null,
      externalProductId,
      credentialsLocked: true,
      credentialsLastUpdatedAt: new Date().toISOString(),
    });
    setIsEditing(false);
    setIsSaving(false);
  };

  const storedStatus = content.status || 'pending';
  const hasPayableLink = isHttpsUrl(content.checkoutUrl);
  useEffect(() => {
    if (readonly || storedStatus !== 'pending' || !hasPayableLink || !accessToken || !documentId) return;
    let cancelled = false;
    const startedAt = Date.now();
    const tick = async () => {
      if (cancelled || document.hidden) return;
      try {
        const next = await getPaymentBrickStatus(id, accessToken);
        if (!cancelled && next.status !== 'pending') {
          setLiveStatus(next);
          clearInterval(timer);
        }
      } catch {
        /* transient: try again on the next tick */
      }
      // Stop after 5 minutes; the status is still refreshed whenever the document is reloaded.
      if (Date.now() - startedAt > 5 * 60 * 1000) clearInterval(timer);
    };
    const timer = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, readonly, storedStatus, hasPayableLink, accessToken, documentId]);

  const handleCopyWebhookUrl = () => {
    if (!providerWebhookUrl) return;
    navigator.clipboard.writeText(providerWebhookUrl);
    setIsWebhookCopied(true);
    setTimeout(() => setIsWebhookCopied(false), 2000);
  };

  const handleCopyUrl = () => {
    if (isHttpsUrl(content.checkoutUrl)) {
      navigator.clipboard.writeText(content.checkoutUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const status = liveStatus && storedStatus === 'pending' ? liveStatus.status : storedStatus;
  const paidAt = liveStatus && storedStatus === 'pending' ? liveStatus.paidAt : content.paidAt;
  const payerEmail = liveStatus && storedStatus === 'pending' ? liveStatus.payerEmail : content.payerEmail;
  // Never render a non-https checkout link as clickable.
  const checkoutUrl = isHttpsUrl(content.checkoutUrl) ? content.checkoutUrl.trim() : null;
  const isConfigured = !!(content.amount && content.amount > 0);

  const statusConfig = {
    pending: { color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-500/10', label: t('payment.status.pending') },
    paid: { color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10', label: t('payment.status.paid') },
    failed: { color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-500/10', label: t('payment.status.failed') },
    refunded: { color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10', label: t('payment.status.refunded') },
  };

  const currentStatus = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const providerLabels = {
    stripe: t('payment.form.providerStripe') || 'Stripe',
    paypal: t('payment.form.providerPaypal') || 'PayPal',
    mercadopago: t('payment.form.providerMercadoPago') || 'MercadoPago',
  };

  // ── EDIT MODE ────────────────────────────────────────────────────────────────
  if (isEditing && canEdit && !readonly) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('payment.header')}</p>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsEditing(false)}>
            {t('payment.cancel')}
          </Button>
        </div>

        <div className="space-y-3">
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder={t('payment.form.titlePlaceholder') || 'Título del pago'}
          />
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder={t('payment.form.descriptionPlaceholder') || 'Descripción opcional'}
            rows={2}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm resize-none outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t('payment.form.amount') || 'Monto'}</p>
            <Input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              step="0.01"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t('payment.form.currency') || 'Moneda'}</p>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="ARS">ARS</option>
              <option value="MXN">MXN</option>
              <option value="BRL">BRL</option>
              <option value="PEN">PEN</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('payment.form.provider') || 'Proveedor'}</p>
          <select
            value={formData.provider}
            onChange={(e) => setFormData({ ...formData, provider: e.target.value as any })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="stripe">{providerLabels.stripe}</option>
            <option value="paypal">{providerLabels.paypal}</option>
            <option value="mercadopago">{providerLabels.mercadopago}</option>
          </select>
        </div>

        {providerWebhookUrl && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t('payment.form.webhookUrl')}</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={providerWebhookUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleCopyWebhookUrl}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                {isWebhookCopied ? t('payment.copied') : t('payment.copyLink')}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">{t('payment.form.webhookUrlHint')}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('payment.form.checkoutUrl') || 'URL de pago (opcional)'}</p>
          <Input
            value={formData.checkoutUrl}
            onChange={(e) => setFormData({ ...formData, checkoutUrl: e.target.value })}
            placeholder={t('payment.form.checkoutUrlPlaceholder') || 'https://... (si tienes un link externo)'}
          />
          <p className="text-[10px] text-muted-foreground">{t('payment.form.checkoutUrlHint') || 'Si está vacío se generará automáticamente con las credenciales del workspace.'}</p>
        </div>

        <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('payment.form.postPayment')}</p>
            <button
              type="button"
              onClick={() => {
                if (activeTeamId && accessToken) {
                  setIsLoadingScripts(true);
                  listScripts(activeTeamId, accessToken)
                    .then(setTeamScripts)
                    .finally(() => setIsLoadingScripts(false));
                }
              }}
              disabled={isLoadingScripts || !activeTeamId || !accessToken}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {isLoadingScripts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          </div>
          <select
            value={content.scriptId || ''}
            onChange={(e) => {
              const scriptId = e.target.value;
              if (scriptId) {
                const script = webhookScripts.find((s) => s.id === scriptId);
                if (script) {
                  const publicToken = script.triggerConfig?.publicToken;
                  const webhookUrl = `${webhookBase}/w/${activeTeamId}/webhook/${scriptId}/${publicToken}`;
                  onUpdate({ ...content, scriptId, webhookUrl });
                }
              } else {
                onUpdate({ ...content, scriptId: undefined, webhookUrl: undefined });
              }
            }}
            disabled={isLoadingScripts}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
          >
            <option value="">{isLoadingScripts ? t('payment.form.loadingScripts') : t('payment.form.noScript')}</option>
            {webhookScripts.map((script) => (
              <option key={script.id} value={script.id}>
                {script.name || script.id}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-md border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-3 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {t('payment.form.credentialsInfo')}
            </p>
            <button
              type="button"
              onClick={() => window.open('/integrations', '_blank')}
              className="text-xs text-emerald-600 dark:text-emerald-400 underline underline-offset-2 hover:no-underline"
            >
              {t('payment.form.openIntegrations')}
            </button>
          </div>
        </div>

        <Button onClick={handleSave} className="w-full" disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {isSaving ? t('payment.form.saving') : t('payment.form.save')}
        </Button>
      </div>
    );
  }

  // ── NOT CONFIGURED (editor only) ─────────────────────────────────────────────
  if (!isConfigured && canEdit) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/10 p-6 text-center space-y-3">
        <CreditCard className="w-8 h-8 text-muted-foreground mx-auto" />
        <div>
          <p className="text-sm font-medium text-foreground">{t('payment.notConfigured')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('payment.notConfiguredHint')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFormData({ title: '', description: '', amount: 0, currency: 'USD', provider: 'stripe', connectionId: '', checkoutUrl: '' });
            setIsEditing(true);
          }}
        >
          <Settings className="h-3.5 w-3.5 mr-2" />
          {t('payment.configure')}
        </Button>
      </div>
    );
  }

  // ── DISPLAY MODE ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
      <div className="bg-muted/40 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {PROVIDER_LABELS[content.provider || 'stripe']}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${currentStatus.bg}`}>
            <StatusIcon status={status} />
            <span className={`text-xs font-medium ${currentStatus.color}`}>{currentStatus.label}</span>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setFormData({
                  title: content.title || '',
                  description: content.description || '',
                  amount: content.amount || 0,
                  currency: content.currency || 'USD',
                  provider: content.provider || 'stripe',
                  connectionId: content.connectionId || '',
                  checkoutUrl: content.checkoutUrl || '',
                });
                setIsEditing(true);
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title={t('payment.edit')}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">{content.title || t('payment.untitled') || 'Pago'}</h3>
          {content.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{content.description}</p>
          )}
        </div>

        <div className="bg-muted/30 rounded-lg p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">{t('payment.amountLabel') || 'Total'}</p>
          <p className="text-4xl font-bold text-foreground tracking-tight">
            {formatAmount(content.amount || 0, content.currency || 'USD')}
          </p>
        </div>

        {status === 'paid' && paidAt && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-emerald-600">{t('payment.state.paidConfirmed') || 'Pago confirmado'}</p>
                <p className="text-emerald-600/80 text-xs">
                  {new Date(paidAt).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {payerEmail && (
                  <p className="text-emerald-600/70 text-xs mt-0.5">{payerEmail}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {status === 'failed' && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-red-600">{t('payment.state.failed') || 'Pago fallido'}</p>
                <p className="text-red-600/80 text-xs">{t('payment.state.failedRetry') || 'Puedes intentarlo de nuevo.'}</p>
              </div>
            </div>
          </div>
        )}

        {status === 'pending' && (
          <div className="flex flex-col gap-2">
            {checkoutUrl ? (
              <>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition font-medium text-sm text-center flex items-center justify-center gap-2 group"
                >
                  {t('payment.payNow')}
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex items-center justify-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted/50 transition text-muted-foreground"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {isCopied ? (t('payment.copied') || 'Copiado') : (t('payment.copyLink') || 'Copiar enlace')}
                </button>
              </>
            ) : canEdit ? (
              <p className="text-xs text-center text-muted-foreground py-1">
                {t('payment.noCheckoutUrlHint') || 'Genera un link de pago configurando las credenciales del proveedor.'}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
