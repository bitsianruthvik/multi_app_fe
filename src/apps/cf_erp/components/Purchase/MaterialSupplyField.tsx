import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { MaterialSupply } from '../../api/requisitions';

/**
 * Who supplies the order's material (§66): "We buy" — earmarked from our stock, the rest bought on purchase
 * orders — or "Customer supplies" — the customer sends it; when the material request is raised a purchase
 * order is made to the customer as vendor (₹0), and what arrives is kept as THEIR stock. Asked when the order is
 * made; it can change until the MR is raised (a line may say otherwise on the Material request stage).
 */
export function MaterialSupplyField({ value, onChange, disabled, helper }: {
  value: MaterialSupply;
  onChange: (v: MaterialSupply) => void;
  disabled?: boolean;
  helper?: string;
}) {
  return (
    <Box data-testid="material-supply" sx={{ display: 'grid', gap: 0.5 }}>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Material</Typography>
      <ToggleButtonGroup exclusive size="small" value={value} disabled={disabled} onChange={(_, v) => v && onChange(v as MaterialSupply)} aria-label="Who supplies the material">
        <ToggleButton value="we_buy">We buy</ToggleButton>
        <ToggleButton value="customer">Customer supplies</ToggleButton>
      </ToggleButtonGroup>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
        {helper ?? (value === 'customer'
          ? 'The customer sends the steel. Raising the material request makes a purchase order to them (₹0); what arrives is kept as their stock.'
          : 'Earmarked from our stock when the material request is raised; the rest is bought on purchase orders.')}
      </Typography>
    </Box>
  );
}
