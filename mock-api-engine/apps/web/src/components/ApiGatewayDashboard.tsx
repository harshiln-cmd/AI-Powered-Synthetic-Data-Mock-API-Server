import { useState } from 'react';
import { Copy, Check, Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react';
import type { ApiKeyTier } from '@mock-api-engine/schema';
import { useApiGateway } from '../hooks/useApiGateway';
import { Button } from './ui/Button';

const TIERS: { value: ApiKeyTier; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
];

function maskKey(apiKey: string, keyPrefix: string, revealed: boolean): string {
  if (revealed) return apiKey;
  return `${keyPrefix}${'•'.repeat(24)}`;
}

function usageBarColor(percentUsed: number): string {
  if (percentUsed >= 100) return 'bg-error';
  if (percentUsed >= 90) return 'bg-warning';
  return 'bg-brand';
}

export function ApiGatewayDashboard() {
  const { apiKey, keyPrefix, tier, usage, isGenerating, isLoadingUsage, error, generateKey, refreshUsage } =
    useApiGateway();
  const [selectedTier, setSelectedTier] = useState<ApiKeyTier>('free');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerate() {
    setRevealed(true); // show the new key immediately, since this is the moment it's meant to be copied
    await generateKey(selectedTier);
  }

  const percentUsed = usage ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-semibold text-ink">API Gateway</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Manage your API key and monitor usage against your plan.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-3.5 py-3 text-sm text-error">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        <div className="p-5">
          {apiKey && keyPrefix ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">API Key</span>
                {tier && (
                  <span className="rounded-full bg-brand/12 px-2.5 py-0.5 text-xs font-medium capitalize text-brand">
                    {tier}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-code text-ink">
                  {maskKey(apiKey, keyPrefix, revealed)}
                </code>
                <button
                  onClick={() => setRevealed((current) => !current)}
                  aria-label={revealed ? 'Hide key' : 'Reveal key'}
                  className="rounded-lg border border-border p-2 text-ink-muted transition-colors hover:bg-border/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  onClick={handleCopy}
                  aria-label="Copy key"
                  className="rounded-lg border border-border p-2 text-ink-muted transition-colors hover:bg-border/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Only shown in full on this device. Generating a new key does not revoke this one.
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-canvas text-ink-muted">
                <KeyRound size={20} />
              </div>
              <h3 className="mt-4 text-sm font-medium text-ink">No API key yet</h3>
              <p className="mt-1.5 max-w-sm text-sm text-ink-muted">
                Generate one to start making authenticated requests to your mock endpoints.
              </p>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-5">
            <div className="flex rounded-lg border border-border p-0.5">
              {TIERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSelectedTier(value)}
                  className={[
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    selectedTier === value ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              <KeyRound size={16} />
              {isGenerating ? 'Generating…' : 'Generate New API Key'}
            </Button>
          </div>
        </div>
      </div>

      {apiKey && (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-panel p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Usage this month</span>
            <button
              onClick={refreshUsage}
              aria-label="Refresh usage"
              disabled={isLoadingUsage}
              className="rounded-md p-1 text-ink-muted transition-colors hover:bg-border/50 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoadingUsage ? 'animate-spin' : ''} />
            </button>
          </div>

          {usage ? (
            <>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className={`h-full rounded-full transition-all ${usageBarColor(percentUsed)}`}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
                <span>
                  {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} requests
                </span>
                <span>Resets {new Date(usage.periodResetsAt).toLocaleDateString()}</span>
              </div>
            </>
          ) : (
            <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-border/40" />
          )}
        </div>
      )}
    </div>
  );
}
