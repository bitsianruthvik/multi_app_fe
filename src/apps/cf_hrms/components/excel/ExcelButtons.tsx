import { useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import { errorMessage, useToast } from '@shared/ui';
import { excelApi, saveBase64File, type ExcelEntity } from '../../api/excel';
import { ExcelUploadDialog } from './ExcelUploadDialog';

/**
 * Download Excel · Upload Excel (CF_HRMS_HIRING_SPEC.md §13.5) — the last two
 * things in a list's toolbar.
 *
 * The download holds what the list shows now, so the screen passes its filters
 * and its row count. The caller passes the rights; nothing renders for a false.
 */
export function ExcelButtons({
  entity,
  noun,
  filters,
  defaults,
  count,
  canDownload,
  canUpload,
  canBulkAdd,
  onApplied,
}: {
  entity: ExcelEntity;
  /** What the screen calls its rows: ['position', 'positions']. */
  noun: [string, string];
  /** The screen's current filters (`filters.params`). */
  filters?: Record<string, string>;
  /**
   * Filters that are on by default (`useListFilters` `defaults`): they are sent,
   * but do not make the file "as filtered".
   */
  defaults?: Record<string, string>;
  /** Rows the list shows now. */
  count: number;
  /** Download = the area's `view`. */
  canDownload: boolean;
  /** Upload = the area's `upload`. */
  canUpload: boolean;
  /** Employees only: may this person add NEW employees by Excel. */
  canBulkAdd?: boolean;
  /** After a successful apply: the screen reloads its list. */
  onApplied: () => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  if (!canDownload && !canUpload) return null;

  const filtered = Object.entries(filters ?? {}).some(([k, v]) => v !== '' && v !== (defaults?.[k] ?? ''));
  const rowsWord = count === 1 ? noun[0] : noun[1];
  const howMany = filtered
    ? `${count.toLocaleString()} ${rowsWord}, as filtered`
    : `All ${count.toLocaleString()} ${rowsWord}`;

  const download = async (blank: boolean) => {
    setMenuAt(null);
    if (busy) return;
    setBusy(true);
    try {
      const file = await excelApi.workbook(entity, blank ? undefined : filters, blank);
      saveBase64File(file);
    } catch (e) {
      toast.error(errorMessage(e, 'The Excel file could not be made. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const downloadIcon = busy ? (
    <CircularProgress size={16} color="inherit" />
  ) : (
    <FileDownloadOutlined fontSize="small" />
  );

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
      {canDownload && (
        <>
          <ButtonGroup variant="outlined" size="small" sx={{ height: 36 }}>
            <Tooltip title={busy ? 'Making the file…' : `Download Excel: ${howMany}`}>
              {/* span keeps the tooltip alive while the button is disabled */}
              <span style={{ display: 'inline-flex' }}>
                <Button
                  onClick={() => void download(false)}
                  disabled={busy}
                  aria-label={`Download Excel. ${howMany}`}
                  startIcon={phone ? undefined : downloadIcon}
                  sx={{
                    height: 36,
                    whiteSpace: 'nowrap',
                    minWidth: phone ? 40 : undefined,
                    px: phone ? 1 : undefined,
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                  }}
                >
                  {phone ? downloadIcon : busy ? 'Making the file…' : 'Download Excel'}
                </Button>
              </span>
            </Tooltip>
            <Button
              onClick={(e) => setMenuAt(e.currentTarget)}
              disabled={busy}
              aria-label="More ways to download"
              aria-haspopup="menu"
              aria-expanded={menuAt ? true : undefined}
              sx={{
                height: 36,
                minWidth: 28,
                px: 0.25,
                ml: '-1px',
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
              }}
            >
              <ArrowDropDownRounded fontSize="small" />
            </Button>
          </ButtonGroup>
          <Menu
            anchorEl={menuAt}
            open={!!menuAt}
            onClose={() => setMenuAt(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={() => void download(false)} sx={{ whiteSpace: 'normal', maxWidth: 320 }}>
              <ListItemText
                primary="What the list shows now"
                secondary={howMany}
                slotProps={{ primary: { sx: { fontSize: 14 } }, secondary: { sx: { fontSize: 12 } } }}
              />
            </MenuItem>
            <MenuItem onClick={() => void download(true)} sx={{ whiteSpace: 'normal', maxWidth: 320 }}>
              <ListItemText
                primary="Blank file for a first load"
                secondary="The same columns and lists, with no rows"
                slotProps={{ primary: { sx: { fontSize: 14 } }, secondary: { sx: { fontSize: 12 } } }}
              />
            </MenuItem>
          </Menu>
        </>
      )}

      {canUpload && (
        <>
          <Tooltip title={phone ? 'Upload Excel' : ''}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setUploadOpen(true)}
              aria-label="Upload Excel"
              startIcon={phone ? undefined : <FileUploadOutlined fontSize="small" />}
              sx={{
                height: 36,
                whiteSpace: 'nowrap',
                minWidth: phone ? 40 : undefined,
                px: phone ? 1 : undefined,
              }}
            >
              {phone ? <FileUploadOutlined fontSize="small" /> : 'Upload Excel'}
            </Button>
          </Tooltip>
          <ExcelUploadDialog
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            entity={entity}
            noun={noun}
            canBulkAdd={canBulkAdd}
            filters={filters}
            onApplied={onApplied}
          />
        </>
      )}
    </Box>
  );
}
