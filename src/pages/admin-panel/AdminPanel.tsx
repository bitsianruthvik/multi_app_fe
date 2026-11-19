import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Container, Tab, Tabs, Typography } from "@mui/material";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@core/contexts/AuthContext";
import { adminApi, problemsOf, type HistoryRow, type Overview, type RoleList } from "./api";
import PeopleTab from "./PeopleTab";
import RolesTab from "./RolesTab";
import { setAppOptions } from "./sees";

const TABS = ["people", "roles", "apps", "history"] as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * THE COMPANY ADMIN PANEL (/:company/apps/admin; backend core/admin). Three things an admin thinks in: a person, their
 * role in each app, and what that role may do — plus the apps the company has and a history of every change made here.
 * It belongs to the company, not to an app: it is reached from the app chooser and from an app's profile menu.
 */
export default function AdminPanel() {
  const { company = "" } = useParams<{ company: string }>();
  const { user } = useAuth();
  const api = useMemo(() => adminApi(company), [company]);
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as (typeof TABS)[number]) : "people";
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [roles, setRoles] = useState<RoleList | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string[]>([]);

  const loadRoles = useCallback(() => { api.roles().then((r) => { setAppOptions(r.apps); setRoles(r); }, (e) => setError(problemsOf(e))); api.overview().then(setOverview, () => undefined); }, [api]);
  useEffect(() => { api.me().then((m) => setAllowed(m.admin), () => setAllowed(false)); }, [api]);
  useEffect(() => { if (allowed) loadRoles(); }, [allowed, loadRoles]);
  useEffect(() => { if (allowed && tab === "history") api.history().then(setHistory, (e) => setError(problemsOf(e))); }, [allowed, tab, api]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
          <Box sx={{ flex: "1 1 260px", minWidth: 0 }}>
            <Typography component="h1" sx={{ fontSize: 24, fontWeight: 600 }}>Admin{overview ? ` · ${overview.company.name}` : ""}</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>People, their role in each app, and what each role may do.</Typography>
          </Box>
          <Button component={Link} to={`/${company}/apps`} variant="outlined">Back to the apps</Button>
        </Box>
        {allowed === null && <CircularProgress size={24} sx={{ mt: 3 }} />}
        {allowed === false && <Alert severity="info" sx={{ mt: 3 }}>Only an admin of this company can open this panel. Ask one of your admins if you need something changed.</Alert>}
        {allowed && (
          <>
            <Tabs value={tab} onChange={(_, v: string) => setParams(v === "people" ? {} : { tab: v })} sx={{ borderBottom: 1, borderColor: "divider", mb: 2.5 }} variant="scrollable">
              <Tab value="people" label="People" sx={{ textTransform: "none" }} />
              <Tab value="roles" label="Roles" sx={{ textTransform: "none" }} />
              <Tab value="apps" label="Apps" sx={{ textTransform: "none" }} />
              <Tab value="history" label="History" sx={{ textTransform: "none" }} />
            </Tabs>
            {error.length > 0 && <Alert severity="error" sx={{ mb: 2, whiteSpace: "pre-line" }} onClose={() => setError([])}>{error.join("\n")}</Alert>}
            {tab === "people" && (roles ? <PeopleTab api={api} apps={roles.apps} roles={roles.roles} meId={Number(user?.id)} onChanged={loadRoles} /> : <CircularProgress size={24} />)}
            {tab === "roles" && <RolesTab api={api} apps={roles?.apps ?? []} roles={roles?.roles ?? null} onChanged={loadRoles} />}
            {tab === "apps" && (
              <Box data-testid="apps">
                <Typography sx={{ fontSize: 13.5, color: "text.secondary", mb: 1.5 }}>The apps this company has. Adding or removing an app is done by us; tell us what you need.</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 1.5 }}>
                  {(overview?.apps ?? []).map((a) => (
                    <Box key={a.appId} sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", p: 2 }}>
                      <Typography sx={{ fontWeight: 600 }}>{a.name}</Typography>
                      <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>{a.people === 1 ? "1 person" : `${a.people} people`} · {a.roles === 1 ? "1 role in use" : `${a.roles} roles in use`}</Typography>
                      <Chip size="small" sx={{ mt: 1 }} variant="outlined" label={a.hasCatalog ? "Departments and levels" : "Permissions one by one"} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
            {tab === "history" && (
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", overflow: "hidden" }} data-testid="history">
                {!history && <Box sx={{ p: 2 }}><CircularProgress size={22} /></Box>}
                {history && history.length === 0 && <Typography sx={{ p: 2, fontSize: 14, color: "text.secondary" }}>Nothing has been changed in this panel yet.</Typography>}
                {(history ?? []).map((h) => (
                  <Box key={h.id} sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", px: 2, py: 1.1, borderBottom: 1, borderColor: "divider", "&:last-child": { borderBottom: 0 }, fontSize: 14 }}>
                    <Box sx={{ flex: "3 1 320px", minWidth: 0, overflowWrap: "anywhere" }}>{h.summary}</Box>
                    <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{h.by ?? "—"} · {when(h.at)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Container>
    </Box>
  );
}
