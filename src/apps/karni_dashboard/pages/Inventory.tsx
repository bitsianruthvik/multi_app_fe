import { useState } from 'react';
import { Box } from '@mui/material';
import { DataTable, FacetChip, FilterBar, SectionCard, StatStrip, ToneBadge, type DataColumn } from '@shared/ui';
import { useReport, type InventoryItem, type InventoryReport } from '../api';
import { ReportPage } from '../components/ReportPage';
import { qty } from '../format';

type Group = InventoryReport['groups'][number];

export default function Inventory() {
  const { data, error, loading, reload } = useReport<InventoryReport>('/inventory');
  const [search, setSearch] = useState('');
  const [shortOnly, setShortOnly] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const s = search.trim().toLowerCase();
  const rows = (data?.items ?? []).filter((i) => (!shortOnly || i.short) && (!group || i.group === group)
    && (!s || i.itemName.toLowerCase().includes(s) || i.itemCode.toLowerCase().includes(s)));

  const q = (k: keyof InventoryItem, header: string): DataColumn<InventoryItem> => ({
    key: k, header, numeric: true, align: 'right', render: (r) => qty(r[k] as number), sortValue: (r) => r[k] as number,
  });
  const cols: DataColumn<InventoryItem>[] = [
    { key: 'itemCode', header: 'Item', render: (r) => r.itemCode, sortValue: (r) => r.itemCode },
    { key: 'itemName', header: 'Description', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'group', header: 'Group', render: (r) => r.group, sortValue: (r) => r.group },
    q('onHand', 'In stock'), q('committed', 'Committed'), q('onOrder', 'On order'), q('available', 'Available'),
    { key: 'uom', header: 'UoM', render: (r) => r.uom },
    { key: 'short', header: '', render: (r) => (r.short ? <ToneBadge label="Short" tone="danger" /> : null), sortValue: (r) => (r.short ? 1 : 0) },
  ];
  const groupCols: DataColumn<Group>[] = [
    { key: 'group', header: 'Group', render: (r) => r.group, sortValue: (r) => r.group },
    { key: 'items', header: 'Items', numeric: true, align: 'right', render: (r) => r.items, sortValue: (r) => r.items },
    { key: 'inStock', header: 'In stock', numeric: true, align: 'right', render: (r) => r.inStock, sortValue: (r) => r.inStock },
    { key: 'short', header: 'Short', numeric: true, align: 'right', render: (r) => r.short || '—', sortValue: (r) => r.short },
  ];

  return (
    <ReportPage title="Inventory" subtitle="Quantities from SAP item master"
      asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}>
      {data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <StatStrip stats={[
            { label: 'Active items', value: data.itemCount },
            { label: 'In stock', value: data.inStock, tone: 'primary' },
            { label: 'Short', value: data.shortCount, tone: data.shortCount ? 'danger' : 'success', hint: 'Committed to customers beyond stock + on order', onClick: () => setShortOnly(true) },
            { label: 'Item groups', value: data.groups.length },
          ]} />
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '1fr 3fr' }, alignItems: 'start' }}>
            <SectionCard title="By group" flush>
              <DataTable rows={data.groups} columns={groupCols} getRowId={(r) => r.group} onRowClick={(r) => setGroup(group === r.group ? null : r.group)} bare />
            </SectionCard>
            <SectionCard flush>
              <FilterBar search={search} onSearch={setSearch} placeholder="Search item code or description">
                <FacetChip label="Short only" active={shortOnly} onClick={() => setShortOnly((v) => !v)} count={data.shortCount} />
                {group && <FacetChip label={group} active onClick={() => setGroup(null)} />}
              </FilterBar>
              <DataTable rows={rows} columns={cols} getRowId={(r) => r.itemCode}
                storageKey="kd-inventory" exportName="inventory" bare />
            </SectionCard>
          </Box>
        </Box>
      )}
    </ReportPage>
  );
}
