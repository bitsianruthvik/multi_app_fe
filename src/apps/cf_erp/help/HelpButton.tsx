import { Box, IconButton, Tooltip, type SxProps, type Theme } from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useHelp } from './helpContext';

/**
 * The "i" button. With no props it opens the help for wherever the user is (route + ?tab=); `tab` names the tab or
 * stage when the URL does not (a page's default tab, the order page's stage); `topic` opens one topic first.
 * `text` puts a few words before the icon (the order page's "How Nesting works"). Outside the CF ERP shell (no
 * HelpProvider) it draws nothing.
 */
export function HelpButton({ topic, tab, label = 'Help for this page', text, sx }: {
  topic?: string; tab?: string | null; label?: string; text?: string; sx?: SxProps<Theme>;
}) {
  const help = useHelp();
  if (!help) return null;
  const open = () => help.open({ topic, tab });
  const button = (
    <Tooltip title={label}>
      <IconButton size="small" aria-label={label} data-help-button={topic ?? tab ?? 'page'} onClick={open}
        sx={{ color: 'var(--c-text-2)', flexShrink: 0, ...(text ? {} : sx as object) }}>
        <InfoOutlined fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  if (!text) return button;
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 12, color: 'var(--c-text-3)', ...sx as object }}>
      <Box component="span" onClick={open} sx={{ cursor: 'pointer' }}>{text}</Box>
      {button}
    </Box>
  );
}
