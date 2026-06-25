import { useState } from 'react';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import TeamPerformance from './TeamPerformance';
import BrandManagement from './BrandManagement';

export default function ManagerDashboard() {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
        Manager Dashboard
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Team Performance" />
        <Tab label="Brand Management" />
      </Tabs>
      {tab === 0 && <TeamPerformance />}
      {tab === 1 && <BrandManagement />}
    </Box>
  );
}
