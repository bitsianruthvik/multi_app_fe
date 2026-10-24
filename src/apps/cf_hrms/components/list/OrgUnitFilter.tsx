import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import type { FilterOption } from './ListToolbar';

/**
 * "Org unit (and below)" — choose ONE OR MORE org units (CF_HRMS_HIRING_SPEC.md
 * §34.2). The server reads them comma-separated (`department=12,40`, or
 * `departmentId=` on leave and attendance), each with everything under it.
 *
 *   orgUnitOptions(rows, labels)  (orgUnits.ts)  the units as filter options: tree order,
 *                                 "Name (Kind)", indented, each in its kind's colour
 *   useOrgUnitOptions()  (orgUnits.ts)         the same, read once (GET /organisation/departments)
 *   <OrgUnitMultiSelect>          the box with chips, for a screen that keeps its
 *                                 filter outside the list toolbar (Attendance)
 *
 * In the list toolbar, a FilterDef with `multiple: true` draws the same box.
 */

/** The box with chips. `value` / `onChange` carry the comma list ('' = any). */
export function OrgUnitMultiSelect({
  value,
  onChange,
  options,
  label = 'Org unit (and below)',
  minWidth = 240,
}: {
  value: string;
  onChange: (next: string) => void;
  options: FilterOption[];
  label?: string;
  minWidth?: number;
}) {
  const chosen = value.split(',').map((v) => v.trim()).filter(Boolean);
  const picked = chosen.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v });
  return (
    <Autocomplete
      multiple
      size="small"
      disableCloseOnSelect
      options={options}
      value={picked}
      onChange={(_, opts) => onChange(opts.map((o) => o.value).join(','))}
      getOptionLabel={(o) => o.label}
      getOptionKey={(o) => o.value}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      noOptionsText="Nothing matches"
      sx={{ minWidth: { xs: '100%', sm: minWidth }, flex: { xs: '1 1 100%', sm: '0 1 360px' } }}
      renderOption={(props, o, { selected }) => {
        const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
        return (
          <li key={key} {...rest} style={{ paddingLeft: 12 + (o.depth ?? 0) * 14 }}>
            {o.colour && <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', mr: 1, flexShrink: 0, background: o.colour.fill, border: `2px solid ${o.colour.edge}` }} />}
            <Box component="span" sx={{ fontWeight: selected ? 600 : 400 }}>{o.label}</Box>
          </li>
        );
      }}
      renderValue={(vals, getItemProps) =>
        vals.map((o, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return (
            <Chip
              key={key}
              size="small"
              label={o.label}
              {...itemProps}
              sx={o.colour ? { background: o.colour.fill, color: o.colour.text, border: `1px solid ${o.colour.edge}`, '& .MuiChip-deleteIcon': { color: o.colour.text } } : undefined}
            />
          );
        })
      }
      renderInput={(params) => <TextField {...params} label={label} placeholder={chosen.length ? '' : 'Any'} />}
    />
  );
}
