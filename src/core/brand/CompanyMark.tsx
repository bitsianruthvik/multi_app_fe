import { Box } from '@mui/material';
import { useCompanyBrand } from './CompanyBrandContext';

/**
 * The mark at the left of every top bar: the signed-in company's logo when it has one (admin panel › Branding),
 * otherwise the app's letter in the primary colour, as before. Always an <img> (a logo may be an SVG; as an image it
 * cannot run script).
 */
export function CompanyMark({ initial, size = 22 }: { initial: string; size?: number }) {
  const { brand } = useCompanyBrand();
  if (brand?.logo) {
    return (
      <Box
        component="img"
        src={brand.logo}
        alt={brand.company?.name ? `${brand.company.name} logo` : 'Company logo'}
        sx={{ height: size + 6, width: 'auto', maxWidth: size * 6, objectFit: 'contain', flexShrink: 0, display: 'block' }}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        width: size, height: size, borderRadius: '6px', flexShrink: 0,
        background: 'var(--c-primary-600)', color: '#fff',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-ui)', fontSize: Math.round(size * 0.55), fontWeight: 600,
      }}
    >
      {initial}
    </Box>
  );
}
