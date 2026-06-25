/**
 * InfoTooltip — platform-wide hover help icon.
 *
 * Drop it anywhere next to a title, tab label, or section header.
 * Pass `content` as an array of sections; each section has an optional
 * heading and a list of bullet strings.
 *
 * ── HOW TO USE ────────────────────────────────────────────────────────────────
 *   import InfoTooltip, { type InfoContent } from '@shared/InfoTooltip';
 *
 *   const MY_INFO: InfoContent = [
 *     { heading: 'What this is', items: ['Short description'] },
 *     { heading: 'How to use',   items: ['Step 1', 'Step 2'] },
 *   ];
 *
 *   <InfoTooltip content={MY_INFO} />
 *
 * ── KEEPING CONTENT CURRENT ───────────────────────────────────────────────────
 *   In every file that uses InfoTooltip, the InfoContent constant is declared
 *   right above the component. Add a comment above it:
 *
 *   // INFO_TOOLTIP — update this block whenever features on this page change.
 *
 *   When you add, rename, or remove a feature, update the bullet that describes
 *   it so the hover help stays accurate for users.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Box, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// ── Public types ──────────────────────────────────────────────────────────────

export interface InfoSection {
  /** Optional bold heading above the bullets */
  heading?: string;
  /** Bullet-point strings */
  items: string[];
}

/** Pass an array of sections to <InfoTooltip content={...} /> */
export type InfoContent = InfoSection[];

// ── Props ─────────────────────────────────────────────────────────────────────

interface InfoTooltipProps {
  content: InfoContent;
  /** Icon size in px (default 16) */
  size?: number;
  /** MUI Tooltip placement (default "right") */
  placement?: React.ComponentProps<typeof Tooltip>['placement'];
}

// ── Tooltip body ──────────────────────────────────────────────────────────────

function TooltipBody({ content }: { content: InfoContent }) {
  return (
    <Box sx={{ py: 0.25 }}>
      {content.map((section, si) => (
        <Box key={si} sx={{ mb: si < content.length - 1 ? 1 : 0 }}>
          {section.heading && (
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ display: 'block', mb: 0.25, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}
            >
              {section.heading}
            </Typography>
          )}
          {section.items.map((item, ii) => (
            <Box key={ii} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', mb: 0.25 }}>
              <Typography variant="caption" sx={{ lineHeight: 1.6, opacity: 0.5, flexShrink: 0, mt: '1px' }}>•</Typography>
              <Typography variant="caption" sx={{ lineHeight: 1.6 }}>{item}</Typography>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InfoTooltip({
  content,
  size = 16,
  placement = 'right',
}: InfoTooltipProps) {
  return (
    <Tooltip
      title={<TooltipBody content={content} />}
      arrow
      placement={placement}
      enterDelay={100}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            maxWidth: 320,
            px: 1.5,
            py: 1,
            border: '1px solid',
            borderColor: 'divider',
          },
        },
        arrow: {
          sx: { color: 'background.paper', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' },
        },
      }}
    >
      {/* span wrapper so Tooltip works on the icon without forwardRef issues */}
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          cursor: 'default',
          verticalAlign: 'middle',
          color: 'text.disabled',
          '&:hover': { color: 'text.secondary' },
          transition: 'color 0.15s',
          lineHeight: 0,
        }}
      >
        <InfoOutlinedIcon sx={{ fontSize: size }} />
      </Box>
    </Tooltip>
  );
}
