import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { FacetChip, KpiGrid, KpiTile, SectionCard, Surface, ToneBadge, useCompanySlug, EmptyState, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { ReportPage } from '../components/ReportPage';
import { ReportTable } from '../components/ReportTable';
import { RankBars, TrendBars } from '../components/Charts';
import { useFilters } from '../filters';
import { labelForScreen } from '../navMeta';
import { dayLabel, inr, inrShort, monthLabel, qty, qtyShort } from '../format';

type Kind = 'text' | 'inr' | 'qty' | 'date' | 'pct' | 'num';
type Row = Record<string, string | number | null>;
interface Insight {
  id: string; area: string; severity: 'high' | 'medium' | 'low'; owner: string; title: string; how: string;
  impact: number | null; impactLabel: string | null; count: number | null; link: string;
  columns: { key: string; label: string; kind: Kind }[]; rows: Row[]; total: number;
  rank: { labelKey: string; valueKey: string; kind: Kind } | null;
  trend?: { title: string; kind: Kind; points: { x: string; y: number }[] };
}
interface InsightsReport { asOf: string | null; today: string; insights: Insight[]; failed: { rule: string; error: string }[] }

const SEV = {
  high: { label: 'Act now', tone: 'danger' as const, color: 'var(--c-danger-600)' },
  medium: { label: 'Watch', tone: 'warning' as const, color: 'var(--c-warning-600)' },
  low: { label: 'For information', tone: 'info' as const, color: 'var(--c-info-600)' },
};
const AREAS = ['Money', 'Sales', 'Orders', 'Purchase', 'Stores', 'Production'];

function fmt(kind: Kind, v: unknown, short = false): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  switch (kind) {
    case 'inr': return short ? inrShort(n) : inr(n);
    case 'qty': return short ? qtyShort(n) : qty(n);
    case 'pct': return `${n.toFixed(1)}%`;
    case 'num': return String(v);
    default: return String(v);
  }
}

/**
 * "Needs attention": the dashboard's first page. Each card is one automatic
 * rule over the SAP data (services/insightService.js) — a sentence, the money
 * at stake, who acts — and opens into its evidence: a trend, a ranking and
 * the rows, with a link to the screen that holds the rest.
 */
export default function Attention() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<InsightsReport>(`/insights${f.query(false)}`);
  const [area, setArea] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => (d?.insights ?? []).filter((i) => !area || i.area === area), [d, area]);
  const count = (s: Insight['severity']) => (d?.insights ?? []).filter((i) => i.severity === s).length;
  const atStake = (d?.insights ?? []).filter((i) => i.severity !== 'low' && i.impact).reduce((t, i) => t + (i.impact || 0), 0);

  return (
    <ReportPage title="Needs attention" subtitle={d ? `Checked automatically against SAP data on ${d.today}` : undefined} filters={f} range={false}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid min={180}>
            <KpiTile label="Act now" display={`${count('high')}`} tone={count('high') ? 'danger' : 'success'} />
            <KpiTile label="Watch" display={`${count('medium')}`} tone={count('medium') ? 'warning' : 'success'} />
            <KpiTile label="For information" display={`${count('low')}`} />
            <KpiTile label="Money at stake" display={inrShort(atStake)} tone="primary" hint="Sum of the rupee impact of 'Act now' and 'Watch' items; some overlap (a customer can be in two)" />
          </KpiGrid>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <FacetChip label="All" active={!area} onClick={() => setArea(null)} count={d.insights.length} />
            {AREAS.map((a) => {
              const n = d.insights.filter((i) => i.area === a).length;
              return n ? <FacetChip key={a} label={a} active={area === a} onClick={() => setArea(area === a ? null : a)} count={n} /> : null;
            })}
          </Stack>
          {list.length === 0 ? (
            <EmptyState title="Nothing needs attention here" hint="Every check came back clean for this selection." />
          ) : (
            <Stack spacing={1.5}>
              {list.map((i) => <InsightCard key={i.id} insight={i} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} />)}
            </Stack>
          )}
        </>
      )}
    </ReportPage>
  );
}

function InsightCard({ insight: i, open, onToggle }: { insight: Insight; open: boolean; onToggle: () => void }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const sev = SEV[i.severity];
  const columns: DataColumn<Row>[] = i.columns.map((c, n) => ({
    key: c.key, header: c.label, numeric: c.kind !== 'text' && c.kind !== 'date', align: c.kind === 'text' || c.kind === 'date' ? 'left' : 'right',
    render: (r) => fmt(c.kind, r[c.key]), sortValue: (r) => (r[c.key] as string | number | null) ?? null,
    exportValue: (r) => (r[c.key] as string | number | null) ?? null, alwaysVisible: n === 0,
  }));
  const hasEvidence = !!i.trend || !!i.rank || i.rows.length > 0;
  return (
    <Surface e={1} sx={{ position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: sev.color }} />
      <Box onClick={hasEvidence ? onToggle : undefined} role={hasEvidence ? 'button' : undefined} tabIndex={hasEvidence ? 0 : undefined}
        onKeyDown={(e) => { if (hasEvidence && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}
        sx={{ p: { xs: 1.75, sm: 2.25 }, pl: { xs: 2.25, sm: 2.75 }, cursor: hasEvidence ? 'pointer' : 'default',
          display: 'flex', gap: 2, alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
            <ToneBadge label={sev.label} tone={sev.tone} />
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' }}>{i.area}</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>· for {i.owner}</Typography>
          </Stack>
          <Typography sx={{ fontSize: { xs: 14.5, sm: 15.5 }, fontWeight: 600, lineHeight: 1.4 }}>{i.title}</Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}>
          {i.impact != null && (
            <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
              <Typography sx={{ fontSize: { xs: 20, sm: 22 }, fontWeight: 700, fontFamily: 'var(--font-mono)', color: sev.color }}>{inrShort(i.impact)}</Typography>
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{i.impactLabel}</Typography>
            </Box>
          )}
          {hasEvidence && (
            <ExpandMoreRounded sx={{ color: 'var(--c-text-3)', transition: 'transform var(--t-fast) var(--ease)', transform: open ? 'rotate(180deg)' : 'none' }} />
          )}
        </Stack>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: { xs: 1.5, sm: 2.75 }, pb: 2.25, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Stack direction="row" spacing={1} sx={{ p: 1.25, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
            <InfoOutlined sx={{ fontSize: 18, color: 'var(--c-text-3)', mt: '1px' }} />
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}><b>How this is worked out:</b> {i.how}</Typography>
          </Stack>
          {(i.trend || i.rank) && (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: i.trend && i.rank ? '1fr 1fr' : '1fr' } }}>
              {i.trend && (
                <SectionCard title={i.trend.title}>
                  <TrendBars height={220} format={(v) => fmt(i.trend!.kind, v, true)}
                    labels={i.trend.points.map((p) => (p.x.length === 7 ? monthLabel(p.x) : dayLabel(p.x)))}
                    series={[{ label: i.trend.title, data: i.trend.points.map((p) => p.y) }]} />
                </SectionCard>
              )}
              {i.rank && i.rows.length > 0 && (
                <SectionCard title="Largest first">
                  <RankBars limit={8} colorIndex={i.severity === 'high' ? 2 : 0} format={(v) => fmt(i.rank!.kind, v, true)}
                    rows={i.rows.map((r, n) => ({ key: `${n}`, label: String(r[i.rank!.labelKey] ?? ''), value: Number(r[i.rank!.valueKey]) || 0 }))} />
                </SectionCard>
              )}
            </Box>
          )}
          {i.rows.length > 0 && (
            <SectionCard title={`The ${i.total} ${i.total === 1 ? 'item' : 'items'} behind this`} subtitle={i.total > i.rows.length ? `First ${i.rows.length} shown` : undefined} flush>
              <ReportTable bare rows={i.rows} columns={columns} getRowId={(r) => i.rows.indexOf(r)} exportName={`attention-${i.id}`} pageSize={10} />
            </SectionCard>
          )}
          <Box>
            <Button variant="outlined" size="small" endIcon={<ArrowForwardRounded />} sx={{ textTransform: 'none' }}
              onClick={() => navigate(`/${company}/karni_dashboard/${i.link}`)}>
              Open {labelForScreen(i.link)}
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Surface>
  );
}
