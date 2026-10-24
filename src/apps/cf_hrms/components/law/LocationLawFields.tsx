/**
 * A location's place in the law (CF_HRMS_HIRING_SPEC.md §36.1): its STATE (a person's state = their
 * main position's location — PT, LWF, minimum wages and leave minimums follow it) and its
 * minimum-wage ZONE (as the state's notification names it). Kept in the law layer's own table
 * (hrms_location_law, /law/locations), saved after the location itself.
 */
import { Box, MenuItem, TextField, Typography } from '@mui/material';

import type { LocationLawDraft } from './useLocationLaw';

export function LocationLawFields({ value, onChange, states, zones }: {
  value: LocationLawDraft; onChange: (v: LocationLawDraft) => void; states: { code: string; name: string }[]; zones: { code: string; name: string }[];
}) {
  return (
    <Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>
        The law here: people whose main position is at this location pay this state’s professional tax and LWF and get its minimum wages. Empty = the company’s state.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField select size="small" label="State (for the law)" value={value.stateCode} onChange={(e) => onChange({ ...value, stateCode: e.target.value })} sx={{ flex: '2 1 240px' }}
          inputProps={{ 'data-field': 'location-law-state' }}>
          <MenuItem value=""><em>The company’s state</em></MenuItem>
          {states.map((s) => <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>)}
        </TextField>
        {zones.length > 0 && value.stateCode === 'TG' ? (
          <TextField select size="small" label="Minimum-wage zone" value={value.zone} onChange={(e) => onChange({ ...value, zone: e.target.value })} sx={{ flex: '1 1 200px' }}
            helperText="Telangana: by the local body the site is in." inputProps={{ 'data-field': 'location-law-zone' }}>
            <MenuItem value=""><em>Not set</em></MenuItem>
            {zones.map((z) => <MenuItem key={z.code} value={z.code}>Zone {z.code} — {z.name}</MenuItem>)}
          </TextField>
        ) : (
          <TextField size="small" label="Minimum-wage zone" value={value.zone} onChange={(e) => onChange({ ...value, zone: e.target.value })} sx={{ flex: '1 1 200px' }}
            helperText="As the state’s minimum-wage notification names it." inputProps={{ maxLength: 20, 'data-field': 'location-law-zone' }} />
        )}
      </Box>
    </Box>
  );
}
