import { useState } from 'react';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import { raiseSetupTicket, type MachineLife } from '../api/machineLife';
import { useCompanySlug } from './useLoad';
import { useIsPermitted } from './useIsPermitted';
import { appPath } from '../navMeta';
import { useToast } from '../components/toastContext';
import { CheckInDialog, CheckOutDialog, CondemnDialog, CostDialog, DisposalDialog, MAINT_TAG, MONEY_TAG, MoveDialog, STORES_TAG } from '../components/MachineLife';

/* ── The actions each stage allows ─────────────────────────────────────────────────────────────────── */

/** Buttons for the machine page header, and the dialogs they open. */
export function useLifeActions(life: MachineLife | null, onChanged: (l?: MachineLife) => void) {
  const company = useCompanySlug();
  const toast = useToast();
  const permitted = useIsPermitted();
  const canStores = permitted(STORES_TAG);
  const canMaint = permitted(MAINT_TAG);
  const canMoney = permitted(MONEY_TAG);
  const canMove = canStores || canMaint;
  const [open, setOpen] = useState<null | 'move' | 'out' | 'in' | 'condemn' | 'disposal' | 'cost'>(null);
  const close = () => setOpen(null);
  const done = (msg: string) => (l?: MachineLife) => { toast.success(msg); onChanged(l); };
  if (!life) return { buttons: null, dialogs: null, openCost: () => {} };
  const s = life.stage;
  const buttons = (
    <>
      {s === 'setup' && life.setupTicket && (
        <Button variant="contained" startIcon={<BuildOutlined />} component={Link} to={appPath(company, `maintenance-orders/${life.setupTicket.id}`)} data-testid="life-ticket">
          Setup ticket {life.setupTicket.code}
        </Button>
      )}
      {s === 'setup' && !life.setupTicket && canMaint && (
        <Button variant="contained" startIcon={<BuildOutlined />} data-testid="life-raise-ticket"
          onClick={async () => { try { onChanged(await raiseSetupTicket(life.id)); toast.success('Setup ticket raised.'); } catch (e) { toast.error((e as Error).message); } }}>
          Raise setup ticket
        </Button>
      )}
      {s === 'live' && canStores && !life.checkout && <Button variant="contained" startIcon={<LogoutRounded />} onClick={() => setOpen('out')} data-testid="life-check-out">Check out</Button>}
      {s === 'live' && canStores && life.checkout && <Button variant="contained" startIcon={<LoginRounded />} onClick={() => setOpen('in')} data-testid="life-check-in">Check in</Button>}
      {(s === 'setup' || s === 'live') && canMove && !life.checkout && <Button variant="outlined" startIcon={<SwapHorizRounded />} onClick={() => setOpen('move')} data-testid="life-move">Move</Button>}
      {(s === 'setup' || s === 'live') && canMaint && <Button variant="outlined" color="error" startIcon={<BlockRounded />} onClick={() => setOpen('condemn')} data-testid="life-condemn">Condemn…</Button>}
      {s === 'condemned' && !life.disposal && canMoney && <Button variant="contained" onClick={() => setOpen('disposal')} data-testid="life-disposal">Record disposal</Button>}
    </>
  );
  const dialogs = (
    <>
      <MoveDialog life={life} open={open === 'move'} onClose={close} onDone={done('Moved.')} />
      <CheckOutDialog open={open === 'out'} onClose={close} machine={life} onDone={() => done(`${life.code} checked out.`)()} />
      <CheckInDialog open={open === 'in'} onClose={close} machine={life} currentAreaId={life.area?.id ?? null} onDone={() => done(`${life.code} checked in.`)()} />
      <CondemnDialog life={life} open={open === 'condemn'} onClose={close} onDone={done('Sent to the MD.')} />
      <DisposalDialog life={life} open={open === 'disposal'} onClose={close} onDone={done('Disposal recorded.')} />
      <CostDialog life={life} open={open === 'cost'} onClose={close} onDone={done('Cost saved.')} />
    </>
  );
  return { buttons, dialogs, openCost: canMoney ? () => setOpen('cost') : null };
}
