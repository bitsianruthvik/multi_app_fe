import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Box, CircularProgress, IconButton, InputBase, Typography,
} from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import FactoryRounded from '@mui/icons-material/FactoryRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import MoveToInboxRounded from '@mui/icons-material/MoveToInboxRounded';
import BuildRounded from '@mui/icons-material/BuildRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import { useNavigate, useParams } from 'react-router-dom';
import { fabGet } from '../api/client';

interface SearchResult {
  id: number;
  name: string;
  code: string;
  detail: string | null;
  type: string;
  typeLabel: string;
}

interface TypeConfig {
  color: string;
  icon: ReactElement;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  item:           { color: '#7C3AED', icon: <Inventory2Rounded sx={{ fontSize: 18 }} /> },
  order:          { color: '#D97706', icon: <ReceiptLongRounded sx={{ fontSize: 18 }} /> },
  supplier:       { color: '#0EA5E9', icon: <LocalShippingRounded sx={{ fontSize: 18 }} /> },
  customer:       { color: '#10B981', icon: <PeopleRounded sx={{ fontSize: 18 }} /> },
  plant:          { color: '#3B82F6', icon: <FactoryRounded sx={{ fontSize: 18 }} /> },
  bom:            { color: '#8B5CF6', icon: <AccountTreeRounded sx={{ fontSize: 18 }} /> },
  grn:            { color: '#64748B', icon: <MoveToInboxRounded sx={{ fontSize: 18 }} /> },
  resource_type:  { color: '#F59E0B', icon: <BuildRounded sx={{ fontSize: 18 }} /> },
  stock_location: { color: '#06B6D4', icon: <WarehouseRounded sx={{ fontSize: 18 }} /> },
};

function resultRoute(result: SearchResult, company: string): string {
  const base = `/${company}/fab_erp`;
  switch (result.type) {
    case 'item':           return `${base}/item-catalog/${result.id}`;
    case 'order':          return `${base}/orders/${result.id}`;
    case 'supplier':       return `${base}/suppliers/${result.id}`;
    case 'customer':       return `${base}/customers`;
    case 'plant':          return `${base}/plants`;
    case 'bom':            return `${base}/routing-plans/${result.id}`;
    case 'grn':            return `${base}/grn-detail`;
    case 'resource_type':  return `${base}/resource-types`;
    case 'stock_location': return `${base}/plants`;
    default:               return `${base}/home`;
  }
}

export function GlobalSearch() {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const navigate              = useNavigate();
  const { company }           = useParams<{ company: string }>();
  const containerRef          = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);
  const latestQuery           = useRef('');

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const data = await fabGet<{ results: SearchResult[] }>('search', { q });
      if (latestQuery.current === q) {
        setResults(data.results ?? []);
        setOpen(true);
      }
    } catch {
      if (latestQuery.current === q) setResults([]);
    } finally {
      if (latestQuery.current === q) setLoading(false);
    }
  }, []);

  useEffect(() => {
    latestQuery.current = query;
    if (!query || query.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(result: SearchResult) {
    navigate(resultRoute(result, company ?? ''));
    setOpen(false);
    setQuery('');
    setResults([]);
  }

  function handleClear() {
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  const showEmpty = open && !loading && query.length >= 2 && results.length === 0;

  return (
    <Box ref={containerRef} sx={{ position: 'relative', mb: 3 }}>
      {/* Search bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2.5,
          height: 56,
          borderRadius: 'var(--r-md)',
          background: 'var(--c-surface-1)',
          border: '1.5px solid var(--c-border)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          '&:focus-within': {
            borderColor: 'var(--c-accent)',
            boxShadow: '0 0 0 3px color-mix(in srgb, var(--c-accent) 15%, transparent)',
          },
        }}
      >
        {loading ? (
          <CircularProgress size={20} sx={{ color: 'var(--c-accent)', flexShrink: 0 }} />
        ) : (
          <SearchRounded sx={{ fontSize: 22, color: 'var(--c-text-3)', flexShrink: 0 }} />
        )}
        <InputBase
          inputRef={inputRef}
          fullWidth
          placeholder="Search items, orders, plants, suppliers, BOMs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && handleClear()}
          sx={{
            fontSize: 15,
            fontFamily: 'var(--font-sans)',
            color: 'var(--c-text-1)',
            '& input::placeholder': { color: 'var(--c-text-3)' },
          }}
          inputProps={{ 'aria-label': 'Global search' }}
        />
        {query && (
          <IconButton size="small" onClick={handleClear} sx={{ flexShrink: 0 }}>
            <CloseRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} />
          </IconButton>
        )}
      </Box>

      {/* Results panel */}
      {(open || showEmpty) && (
        <Box
          sx={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 1300,
            background: 'var(--c-surface-1)',
            border: '1.5px solid var(--c-border)',
            borderRadius: 'var(--r-md)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.20)',
            maxHeight: 500,
            overflowY: 'auto',
          }}
        >
          {showEmpty ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <SearchRounded sx={{ fontSize: 32, color: 'var(--c-text-3)', mb: 1 }} />
              <Typography sx={{ color: 'var(--c-text-3)', fontSize: 14 }}>
                No results for "{query}"
              </Typography>
            </Box>
          ) : (
            results.map((r, i) => {
              const cfg: TypeConfig = TYPE_CONFIG[r.type] ?? {
                color: '#888',
                icon: <SearchRounded sx={{ fontSize: 18 }} />,
              };
              const secondary = [r.code, r.detail].filter(Boolean).join(' · ');
              return (
                <Box
                  key={`${r.type}-${r.id}`}
                  onClick={() => handleSelect(r)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.25,
                    cursor: 'pointer',
                    borderBottom: i < results.length - 1 ? '1px solid var(--c-border)' : 'none',
                    '&:hover': { background: 'var(--c-surface-2)' },
                    '&:first-of-type': { borderRadius: 'calc(var(--r-md) - 1.5px) calc(var(--r-md) - 1.5px) 0 0' },
                    '&:last-of-type':  { borderRadius: '0 0 calc(var(--r-md) - 1.5px) calc(var(--r-md) - 1.5px)' },
                  }}
                >
                  {/* Icon box */}
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 'var(--r-sm)',
                      background: cfg.color + '22',
                      color: cfg.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {cfg.icon}
                  </Box>

                  {/* Name + secondary */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--c-text-1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.name}
                    </Typography>
                    {secondary && (
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: 'var(--c-text-3)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {secondary}
                      </Typography>
                    )}
                  </Box>

                  {/* Type chip */}
                  <Box
                    sx={{
                      flexShrink: 0,
                      px: 1.25,
                      py: 0.375,
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '.04em',
                      color: cfg.color,
                      background: cfg.color + '22',
                    }}
                  >
                    {r.typeLabel}
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      )}
    </Box>
  );
}
