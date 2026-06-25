import React from 'react';
import { Box, Typography, Button } from '@mui/material';

interface Props { children: React.ReactNode; level?: 'shell' | 'page'; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
    try {
      localStorage.setItem('__lastRenderError', JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        ts: new Date().toISOString(),
      }));
    } catch (_) { /* ignore */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="error" gutterBottom>
          Something went wrong on this page.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {this.state.error?.message}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, fontFamily: 'monospace', whiteSpace: 'pre-wrap', textAlign: 'left', maxHeight: 200, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
          {this.state.error?.stack}
        </Typography>
        <Button variant="outlined" onClick={() => this.setState({ hasError: false })}>
          Try Again
        </Button>
      </Box>
    );
  }
}
