import { Box } from '@mui/material';
import { PageHeader } from '../components/ui';
import { CustomerMaterialStatus } from '../components/Purchase/CustomerMaterialStatus';

/**
 * TO RETURN TO CUSTOMERS (§68): every customer's material that is to go back — more than their order needs, or a
 * substitute the MD did not accept — and the different items they sent, with where each stands. The server works it
 * out on every read; the "return to customer" movement (an order's Customer material tab) takes a row off.
 */
export default function CustomerReturns() {
  return (
    <Box>
      <PageHeader title="To return to customers" subtitle="Customer material that is not needed or not accepted. It is theirs, not ours, and not earmarked for any work." />
      <CustomerMaterialStatus showEmpty />
    </Box>
  );
}
