import { Box, Card, CardContent, Container, Typography } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import { useAuth } from '@core/contexts/AuthContext';

const stats = [
  { label: 'My Leads',         Icon: PeopleAltIcon,       color: '#5c6bc0' },
  { label: 'Meetings Today',   Icon: EventAvailableIcon,  color: '#26a69a' },
  { label: 'Sales This Month', Icon: MonetizationOnIcon,  color: '#ef5350' },
  { label: 'Target Progress',  Icon: TrendingUpIcon,      color: '#ffa726' },
];

export default function SalesControlDashboard() {
  const { user } = useAuth();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} color="text.primary">
          Welcome back, {user?.name ?? 'there'}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
          Here's your sales overview.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
        }}
      >
        {stats.map(({ label, Icon, color }) => (
          <Box key={label} sx={{ flex: '1 1 220px', minWidth: 0 }}>
            <Card sx={{ borderTop: `4px solid ${color}` }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    bgcolor: `${color}18`,
                    borderRadius: 2,
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon sx={{ color, fontSize: 28 }} />
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight={700}>—</Typography>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          mt: 6,
          p: 4,
          borderRadius: 3,
          bgcolor: 'action.hover',
          textAlign: 'center',
        }}
      >
        <Typography variant="h6" fontWeight={600} color="text.primary" gutterBottom>
          Sales Control
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your admin will configure leads, targets, and reports here.
        </Typography>
      </Box>
    </Container>
  );
}
