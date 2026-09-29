import { useEffect, useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { getMachines } from '../api/floor';
import type { FloorMachine, FloorOperator } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { MachinePicker, OperatorPicker, LoadState } from '../components/Floor/Pickers';
import { MachineScreen } from '../components/Floor/MachineScreen';
import { TOUCH } from '../components/Floor/floorModel';
import { loadMachineId, loadOperator, saveMachineId, saveOperator } from '../components/Floor/floorStore';
import { appPath } from '../navMeta';

/**
 * The machine log, at the machine (plan: CF_ERP_FLOOR_LOG_PLAN.md section 3).
 * A shared tablet stays signed in; it remembers its machine, and asks who is
 * using it. Everything is a big button and a list — no codes are typed.
 * The route renders without the app's top navigation (CfErpShell), so what the
 * person sees is this header and one task.
 */
export default function Floor() {
  const company = useCompanySlug();
  const [machineId, setMachineId] = useState<number | null>(() => loadMachineId(company));
  const [operator, setOperator] = useState<FloorOperator | null>(() => {
    const o = loadOperator(company);
    return o ? { id: o.id, code: null, name: o.name } : null;
  });

  // The remembered machine is only an id; its name comes from the list.
  const machines = useLoad<FloorMachine[] | null>(() => (machineId ? getMachines() : Promise.resolve(null)), [machineId]);
  const machine = machineId ? machines.data?.find((m) => m.id === machineId) ?? null : null;
  useEffect(() => {
    // A machine that no longer exists (or is no longer visible) is forgotten, not an error screen.
    if (machineId && machines.data && !machine) { saveMachineId(company, null); setMachineId(null); }
  }, [machineId, machines.data, machine, company]);

  const chooseMachine = (m: FloorMachine | null) => { saveMachineId(company, m?.id ?? null); setMachineId(m?.id ?? null); };
  const chooseOperator = (o: FloorOperator | null) => { saveOperator(company, o ? { id: o.id, name: o.name } : null); setOperator(o); };

  return (
    <Box sx={{ minHeight: '100vh', background: 'var(--c-canvas)', color: 'var(--c-text)', fontFamily: 'var(--font-ui)' }}>
      <Box component="header" sx={{
        position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 1.5, px: 2, minHeight: 72,
        background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)',
      }}>
        {machineId ? (
          <ButtonBase onClick={() => chooseMachine(null)} aria-label="Back to the machine list" sx={{ height: TOUCH, minWidth: TOUCH, px: { xs: 1, sm: 1.5 }, gap: 0.5, borderRadius: 'var(--r-md)', border: '2px solid var(--c-border)', fontSize: 16, fontWeight: 600 }}>
            <ArrowBackRounded /> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Machines</Box>
          </ButtonBase>
        ) : (
          <Box component="a" href={appPath(company, 'home')} sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text-2)', textDecoration: 'none', minHeight: TOUCH, display: 'inline-flex', alignItems: 'center' }}>Menu</Box>
        )}
        <Typography component="div" sx={{ flex: 1, minWidth: 0, fontSize: { xs: 22, sm: 26 }, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {machine ? machine.name : 'Machine log'}
        </Typography>
        {operator && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Box sx={{ fontSize: 18, fontWeight: 600, display: { xs: 'none', sm: 'block' } }}>{operator.name}</Box>
            <ButtonBase onClick={() => chooseOperator(null)} sx={{ height: TOUCH, px: 2, borderRadius: 'var(--r-md)', border: '2px solid var(--c-border)', fontSize: 16, fontWeight: 600 }}>Not you?</ButtonBase>
          </Box>
        )}
      </Box>

      <Box component="main" sx={{ maxWidth: 820, mx: 'auto', p: 2, pb: 6 }}>
        {!machineId && <MachinePicker onPick={chooseMachine} />}
        {machineId && !machine && <LoadState loading={machines.loading} error={machines.error} onRetry={machines.reload} />}
        {machine && !operator && <OperatorPicker machine={machine} onPick={chooseOperator} />}
        {machine && operator && <MachineScreen key={machine.id} machine={machine} operator={operator} />}
      </Box>
    </Box>
  );
}
