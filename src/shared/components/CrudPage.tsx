/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, ReactNode } from 'react';
import {
  Box, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, Skeleton, Typography,
  MenuItem,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { query, mutate } from '@core/api-builder';

export interface Column {
  field: string;
  header: string;
  render?: (val: any, row: any) => ReactNode;
}

export interface FormField {
  field: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'date' | 'datetime' | 'textarea';
  options?: { value: any; label: string }[];
  required?: boolean;
}

export interface CrudPageProps {
  title: string;
  resource: string;
  queryFields: string[];
  columns: Column[];
  formFields: FormField[];
  defaultSort?: Record<string, 'asc' | 'desc'>;
}

export default function CrudPage({
  title, resource, queryFields, columns, formFields, defaultSort,
}: CrudPageProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const emptyForm = () =>
    Object.fromEntries(formFields.map(f => [f.field, f.type === 'number' ? 0 : '']));

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await query({
        resource,
        fields: queryFields,
        sort: defaultSort ?? { created_at: 'desc' },
      });
      setRows(Array.isArray(result) ? result : (result as any)?.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (row: any) => {
    setEditing(row);
    setForm(Object.fromEntries(formFields.map(f => [f.field, row[f.field] ?? ''])));
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const writeFields = formFields.map(f => f.field);
      if (editing) {
        await mutate({ resource, fields: writeFields, data: { id: editing.id, ...form }, method: 'PUT' });
      } else {
        await mutate({ resource, fields: writeFields, data: form, method: 'POST' });
      }
      setOpen(false);
      await fetchItems();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: any) => {
    if (!window.confirm(`Delete "${row.name || row.id}"?`)) return;
    try {
      await mutate({
        resource,
        fields: ['deleted_at'],
        data: { id: row.id, deleted_at: new Date().toISOString() },
        method: 'PUT',
      });
      await fetchItems();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const requiredField = formFields.find(f => f.required);
  const saveDisabled = saving || (!!requiredField && !String(form[requiredField.field] ?? '').trim());

  if (loading) {
    return <Box sx={{ p: 2 }}>{[1, 2, 3].map(i => <Skeleton key={i} height={48} />)}</Box>;
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>{title}</Typography>
        <Button variant="contained" onClick={openAdd}>Add {title.replace(/s$/, '')}</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {columns.map(c => <TableCell key={c.field}>{c.header}</TableCell>)}
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} align="center">No records found</TableCell>
              </TableRow>
            ) : rows.map(row => (
              <TableRow key={row.id}>
                {columns.map(c => (
                  <TableCell key={c.field}>
                    {c.render ? c.render(row[c.field], row) : String(row[c.field] ?? '')}
                  </TableCell>
                ))}
                <TableCell>
                  <IconButton size="small" onClick={() => openEdit(row)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(row)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? `Edit ${title.replace(/s$/, '')}` : `Add ${title.replace(/s$/, '')}`}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {formFields.map(f => {
            const value = form[f.field] ?? '';
            const onChange = (val: any) => setForm(prev => ({ ...prev, [f.field]: val }));
            if (f.type === 'select' && f.options) {
              return (
                <TextField key={f.field} select label={f.label} required={f.required} value={value}
                  onChange={e => onChange(e.target.value)}>
                  {f.options.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </TextField>
              );
            }
            if (f.type === 'textarea') {
              return (
                <TextField key={f.field} label={f.label} required={f.required} multiline rows={3}
                  value={value} onChange={e => onChange(e.target.value)} />
              );
            }
            return (
              <TextField key={f.field} label={f.label} required={f.required}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                InputLabelProps={f.type === 'date' ? { shrink: true } : undefined}
                value={value}
                onChange={e => onChange(f.type === 'number' ? (parseInt(e.target.value, 10) || 0) : e.target.value)} />
            );
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saveDisabled}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
