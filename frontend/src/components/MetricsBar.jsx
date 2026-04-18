import { FileText, ClipboardCheck, Zap, DollarSign, Clock } from 'lucide-react';

function MetricCard({ icon: Icon, label, value, sub, color = 'text-[#1B2A4A]' }) {
  return (
    <div className="card px-5 py-4 flex items-start gap-3.5">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#1B2A4A]/5 flex items-center justify-center mt-0.5">
        <Icon size={16} className="text-[#1B2A4A]" />
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold leading-tight ${color}`}>{value}</p>
        <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function formatTokens(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd) {
  if (usd == null || usd === 0) return '—';
  if (usd < 0.0001) return '<$0.0001';
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}

function formatTime(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function shortModelName(id) {
  if (!id) return 'Unknown';
  if (id.includes('claude-sonnet')) return 'Claude Sonnet';
  if (id.includes('claude-haiku')) return 'Claude Haiku';
  if (id.includes('claude-opus')) return 'Claude Opus';
  if (id.includes('glm')) return 'GLM-5';
  if (id.includes('kimi')) return 'Kimi K2';
  if (id.includes('minimax')) return 'MiniMax M2';
  return id.split('.').pop();
}

export default function MetricsBar({ metrics, papersCount, appraised, elapsedMs }) {
  const inputTokens = metrics?.input_tokens ?? 0;
  const outputTokens = metrics?.output_tokens ?? 0;
  const totalTokens = metrics?.total_tokens ?? (inputTokens + outputTokens);
  const costUsd = metrics?.cost_usd ?? 0;
  const byModel = metrics?.by_model ?? {};
  const modelEntries = Object.entries(byModel).filter(([, v]) => v.input_tokens || v.output_tokens);

  return (
    <div className="mb-6 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard icon={FileText} label="Papers extracted" value={papersCount ?? '—'} />
        <MetricCard icon={ClipboardCheck} label="Papers appraised" value={appraised ?? '—'} />
        <MetricCard
          icon={Zap}
          label="Total tokens"
          value={formatTokens(totalTokens)}
          sub={`${formatTokens(inputTokens)} in / ${formatTokens(outputTokens)} out`}
        />
        <MetricCard icon={DollarSign} label="Est. cost" value={formatCost(costUsd)} color="text-green-700" />
        <MetricCard icon={Clock} label="Total time" value={formatTime(elapsedMs)} />
      </div>

      {/* Per-model breakdown */}
      {modelEntries.length > 0 && (
        <div className="card px-5 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Cost by model</p>
          <div className="divide-y divide-gray-50">
            {modelEntries.map(([modelId, v]) => (
              <div key={modelId} className="flex items-center justify-between py-1.5 text-xs">
                <span className="font-medium text-gray-700">{shortModelName(modelId)}</span>
                <div className="flex items-center gap-4 text-gray-500">
                  <span>{formatTokens(v.input_tokens)} in / {formatTokens(v.output_tokens)} out</span>
                  <span className="font-semibold text-gray-700">{formatCost(v.cost_usd)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
