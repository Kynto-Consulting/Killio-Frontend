'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, AlertCircle, CheckCircle2, Copy, ExternalLink, Lock, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslations } from '@/components/providers/i18n-provider';
import { useSession } from '@/components/providers/session-provider';
import { listScripts, type ScriptSummary } from '@/lib/api/scripts';
import { createPaymentLink, type CreatePaymentLinkPayload } from '@/lib/api/payments';
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
    // Credenciales - NUNCA en display mode
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
  
  const [isEditing, setIsEditing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [overrideCredentials, setOverrideCredentials] = useState(false);
  const [teamScripts, setTeamScripts] = useState<ScriptSummary[]>([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Credenciales SOLO en formData cuando está en edit+override mode
  const [formData, setFormData] = useState({
    title: content.title || '',
    description: content.description || '',
    amount: content.amount || 0,
    currency: content.currency || 'USD',
    provider: content.provider || 'stripe',
    connectionId: content.connectionId || '',
    checkoutUrl: content.checkoutUrl || '',
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    paypalClientId: '',
    paypalClientSecret: '',
    paypalMode: 'sandbox' as 'sandbox' | 'live',
    mercadopagoAccessToken: '',
    mercadopagoMode: 'sandbox' as 'sandbox' | 'live',
  });

  const webhookBase = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.NEXT_PUBLIC_KILLIO_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000'
    ).replace(/\/+$/, '');
  }, []);

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

    if (!checkoutUrl && formData.amount > 0 && accessToken) {
      try {
        const payload: CreatePaymentLinkPayload = {
          cardId: id,
          brickId: id,
          title: formData.title,
          description: formData.description || undefined,
          amount: formData.amount,
          currency: formData.currency,
          provider: formData.provider,
          connectionId: formData.connectionId || undefined,
        };

        if (overrideCredentials) {
          // Only send credentials when user explicitly overrides them in edit mode
          (payload as any).stripeSecretKey = formData.stripeSecretKey || undefined;
          (payload as any).stripeWebhookSecret = formData.stripeWebhookSecret || undefined;
          (payload as any).paypalClientId = formData.paypalClientId || undefined;
          (payload as any).paypalClientSecret = formData.paypalClientSecret || undefined;
          (payload as any).paypalMode = formData.paypalMode || undefined;
          (payload as any).mercadopagoAccessToken = formData.mercadopagoAccessToken || undefined;
          (payload as any).mercadopagoMode = formData.mercadopagoMode || undefined;
        }

        const paymentLink = await createPaymentLink(payload, accessToken);

        checkoutUrl = paymentLink.checkoutUrl;
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
      status: content.status || 'pending',
      credentialsLocked: true,
      credentialsLastUpdatedAt: new Date().toISOString(),
    });
    setIsEditing(false);
    setOverrideCredentials(false);
    setIsSaving(false);
  };

  const handleCopyUrl = () => {
    if (content.checkoutUrl) {
      navigator.clipboard.writeText(content.checkoutUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const status = content.status || 'pending';
  const checkoutUrl = content.checkoutUrl;

  const statusConfig = {
    pending: { color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-500/10', icon: '⏳', label: t('payment.status.pending') },
    paid: { color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: '✅', label: t('payment.status.paid') },
    failed: { color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-500/10', icon: '❌', label: t('payment.status.failed') },
    refunded: { color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10', icon: '↩️', label: t('payment.status.refunded') },
  };

  const currentStatus = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const providerLabels = {
    stripe: t('payment.form.providerStripe'),
    paypal: t('payment.form.providerPaypal'),
    mercadopago: t('payment.form.providerMercadoPago'),
  };

  // ═══════════════════════════════════════════════════════════════════
  // EDIT MODE
  // ═══════════════════════════════════════════════════════════════════
  if (isEditing && canEdit && !readonly) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 space-y-4 shadow-sm">
        {/* Básico */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('payment.form.title')}</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder={t('payment.form.titlePlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('payment.form.description')}</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder={t('payment.form.descriptionPlaceholder')}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('payment.form.amount')}</label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              step="0.01"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('payment.form.currency')}</label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="ARS">ARS</option>
              <option value="MXN">MXN</option>
              <option value="BRL">BRL</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('payment.form.provider')}</label>
          <select
            value={formData.provider}
            onChange={(e) => setFormData({ ...formData, provider: e.target.value as any })}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
          >
            <option value="stripe">{providerLabels.stripe}</option>
            <option value="paypal">{providerLabels.paypal}</option>
            <option value="mercadopago">{providerLabels.mercadopago}</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('payment.form.checkoutUrl')}</label>
          <Input
            value={formData.checkoutUrl}
            onChange={(e) => setFormData({ ...formData, checkoutUrl: e.target.value })}
            placeholder={t('payment.form.checkoutUrlPlaceholder')}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">{t('payment.form.checkoutUrlHint')}</p>
        </div>

        {/* Webhooks */}
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">{t('payment.form.webhooks')}</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                if (activeTeamId && accessToken) {
                  setIsLoadingScripts(true);
                  listScripts(activeTeamId, accessToken)
                    .then(setTeamScripts)
                    .finally(() => setIsLoadingScripts(false));
                }
              }}
              disabled={isLoadingScripts || !activeTeamId || !accessToken}
            >
              {isLoadingScripts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">{t('payment.form.webhookScript')}</label>
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
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            >
              <option value="">{isLoadingScripts ? t('payment.form.loading') : t('payment.form.selectScript')}</option>
              {webhookScripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.name || script.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">{t('payment.form.webhookUrl')}</label>
            <Input
              value={content.webhookUrl || ''}
              onChange={(e) => onUpdate({ ...content, webhookUrl: e.target.value, scriptId: undefined })}
              placeholder={t('payment.form.webhookUrlPlaceholder')}
              className="text-sm"
            />
          </div>
        </div>

        {/* CREDENCIALES - Solo en override mode */}
        {overrideCredentials && (
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded p-3">
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                ⚠️ {t('payment.form.credentialsOverrideWarning')}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold">{t('payment.form.secretsTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('payment.form.secretsHint')}</p>
            </div>

            {/* Stripe */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('payment.form.stripeSecretKey')}</label>
              <input
                type="password"
                value={formData.stripeSecretKey}
                onChange={(e) => setFormData({ ...formData, stripeSecretKey: e.target.value })}
                placeholder="sk_live_xxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('payment.form.stripeWebhookSecret')}</label>
              <input
                type="password"
                value={formData.stripeWebhookSecret}
                onChange={(e) => setFormData({ ...formData, stripeWebhookSecret: e.target.value })}
                placeholder="whsec_xxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              />
            </div>

            {/* PayPal */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('payment.form.paypalClientId')}</label>
              <input
                type="password"
                value={formData.paypalClientId}
                onChange={(e) => setFormData({ ...formData, paypalClientId: e.target.value })}
                placeholder="xxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('payment.form.paypalClientSecret')}</label>
              <input
                type="password"
                value={formData.paypalClientSecret}
                onChange={(e) => setFormData({ ...formData, paypalClientSecret: e.target.value })}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('payment.form.paypalMode')}</label>
              <select
                value={formData.paypalMode}
                onChange={(e) => setFormData({ ...formData, paypalMode: e.target.value as any })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              >
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </div>

            {/* MercadoPago */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('payment.form.mercadopagoAccessToken')}</label>
              <input
                type="password"
                value={formData.mercadopagoAccessToken}
                onChange={(e) => setFormData({ ...formData, mercadopagoAccessToken: e.target.value })}
                placeholder="xxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('payment.form.mercadopagoMode')}</label>
              <select
                value={formData.mercadopagoMode}
                onChange={(e) => setFormData({ ...formData, mercadopagoMode: e.target.value as any })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              >
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-2 pt-4 border-t border-border">
          <Button onClick={handleSave} className="flex-1" variant="default" disabled={isSaving}>
            {isSaving ? t('payment.form.saving') : t('payment.form.save')}
          </Button>
          <Button
            onClick={() => {
              setIsEditing(false);
              setOverrideCredentials(false);
            }}
            className="flex-1"
            variant="outline"
          >
            {t('payment.form.cancel')}
          </Button>
          {content.credentialsLocked && !overrideCredentials && (
            <Button
              onClick={() => setOverrideCredentials(true)}
              className="flex-1"
              variant="outline"
            >
              {t('payment.form.overrideCredentials')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // DISPLAY MODE (Readonly) - Credenciales NUNCA visibles
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
      {/* Encabezado */}
      <div className="bg-muted/40 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold">{PROVIDER_LABELS[content.provider || 'stripe']}</span>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${currentStatus.bg}`}>
          <span className="text-lg">{currentStatus.icon}</span>
          <span className={`text-xs font-medium ${currentStatus.color}`}>{currentStatus.label}</span>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-6 space-y-4">
        {/* Título y descripción */}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-foreground">{content.title || t('payment.untitled')}</h3>
          {content.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{content.description}</p>
          )}
        </div>

        {/* Monto prominente */}
        <div className="bg-muted/30 rounded-lg p-4 text-center">
          <div className="text-sm text-muted-foreground mb-1">{t('payment.amountLabel')}</div>
          <div className="text-4xl font-bold text-foreground">
            {formatAmount(content.amount || 0, content.currency || 'USD')}
          </div>
        </div>

        {/* Estado: Pagado */}
        {status === 'paid' && content.paidAt && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-emerald-600">{t('payment.state.paidConfirmed')}</p>
                <p className="text-emerald-600/80">
                  {new Date(content.paidAt).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                {content.payerEmail && (
                  <p className="text-emerald-600/70 text-xs mt-1">{content.payerEmail}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Estado: Fallido */}
        {status === 'failed' && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-red-600">{t('payment.state.failed')}</p>
                <p className="text-red-600/80">{t('payment.state.failedRetry')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Credenciales bloqueadas - Indicador SOLO (sin datos sensibles) */}
        {content.credentialsLocked && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg p-3 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-300 flex-shrink-0" />
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              <p className="font-medium">{t('payment.credentialsLocked')}</p>
              {content.credentialsLastUpdatedAt && (
                <p className="opacity-70">
                  {t('payment.credentialsConfigured')}: {new Date(content.credentialsLastUpdatedAt).toLocaleDateString('es-ES')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Webhook URL */}
        {content.webhookUrl && (
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">{t('payment.webhookUrl')}</p>
            <p className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all">{content.webhookUrl}</p>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-col gap-2 pt-2">
          {status === 'pending' ? (
            <>
              {checkoutUrl && !readonly ? (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition font-medium text-center flex items-center justify-center gap-2 group"
                >
                  {t('payment.payNow')}
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full px-4 py-3 bg-muted text-muted-foreground rounded-lg transition font-medium text-center flex items-center justify-center gap-2 opacity-70 cursor-not-allowed"
                >
                  {t('payment.noCheckoutUrl')}
                </button>
              )}
              {checkoutUrl ? (
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center justify-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted/50 transition"
                >
                  <Copy className="w-4 h-4" />
                  {isCopied ? t('payment.copied') : t('payment.copyLink')}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">{t('payment.noCheckoutUrlHint')}</p>
              )}
            </>
          ) : null}

          {canEdit && (
            <button
              onClick={() => {
                setFormData({
                  title: content.title || '',
                  description: content.description || '',
                  amount: content.amount || 0,
                  currency: content.currency || 'USD',
                  provider: content.provider || 'stripe',
                  connectionId: content.connectionId || '',
                  checkoutUrl: content.checkoutUrl || '',
                  stripeSecretKey: '',
                  stripeWebhookSecret: '',
                  paypalClientId: '',
                  paypalClientSecret: '',
                  paypalMode: 'sandbox',
                  mercadopagoAccessToken: '',
                  mercadopagoMode: 'sandbox',
                });
                setOverrideCredentials(false);
                setIsEditing(true);
              }}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted/50 transition"
            >
              {t('payment.edit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
