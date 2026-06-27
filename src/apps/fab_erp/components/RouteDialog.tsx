import { useState } from 'react';
import { Button, Dialog } from '@mui/material';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { RoutingPlanCanvas } from '../pages/RoutingPlanBuilder';

/**
 * Popup for viewing/editing a single routing plan without leaving the BOM
 * screen — embeds the same visual canvas the full-page Routing Plan Builder
 * uses. Opens in view mode; the toolbar's Edit toggle enables editing.
 */
export default function RouteDialog({ planId, onClose }: { planId: number; onClose: () => void }) {
  const [editing, setEditing] = useState(false);

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{ paper: { sx: { height: '85vh' } } }}
    >
      <RoutingPlanCanvas
        planId={planId}
        readOnly={!editing}
        onBack={onClose}
        toolbarRight={
          <Button
            size="small"
            variant={editing ? 'contained' : 'outlined'}
            startIcon={editing ? <VisibilityRoundedIcon /> : <EditRoundedIcon />}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? 'Done editing' : 'Edit'}
          </Button>
        }
      />
    </Dialog>
  );
}
