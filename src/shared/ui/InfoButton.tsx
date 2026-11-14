import { useState, type ReactNode, type MouseEvent } from 'react';
import { Box, IconButton, Popover, Typography } from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

/**
 * A small "i" button that opens a plain-language explanation of a card.
 * Click or tap (works on touch screens, unlike a hover tooltip). Optional on
 * cards: a card with no `info` shows no button.
 */
export function InfoButton({ text, label = 'What this shows' }: { text: ReactNode; label?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = (e: MouseEvent<HTMLElement>) => { e.stopPropagation(); setAnchor(e.currentTarget); };
  return (
    <>
      <IconButton
        size="small"
        aria-label={label}
        onClick={open}
        onMouseDown={(e) => e.stopPropagation()}
        sx={{ p: 0.5, color: 'var(--c-text-3)', '&:hover': { color: 'var(--c-primary-600)' } }}
      >
        <InfoOutlined sx={{ fontSize: 17 }} />
      </IconButton>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClick={(e) => e.stopPropagation()}
        slotProps={{ paper: { sx: { maxWidth: 340, p: 1.75, borderRadius: 'var(--r-md)' } } }}
      >
        <Box sx={{ fontSize: 13, lineHeight: 1.55, color: 'var(--c-text)' }}>
          {typeof text === 'string' ? <Typography component="p" sx={{ m: 0, fontSize: 13, lineHeight: 1.55 }}>{text}</Typography> : text}
        </Box>
      </Popover>
    </>
  );
}
