import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { problemsOf, type AdminApi, type AppRow, type Person, type RoleRow } from "./api";
import { menuOf } from "./sees";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);
const Problems = ({ list }: { list: string[] }) => (list.length ? <Alert severity="error" sx={{ whiteSpace: "pre-line" }}>{list.join("\n")}</Alert> : null);

/** A temporary password is shown once: the admin hands it over, the person changes it at first login. */
export function PasswordDialog({ shown, onClose }: { shown: { title: string; rows: { name: string; login: string; password: string }[] } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = (shown?.rows ?? []).map((r) => `${r.name}\t${r.login}\t${r.password}`).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return (
    <Dialog open={!!shown} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle component="div" sx={{ fontSize: 20, fontWeight: 600 }}>{shown?.title}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>Write {shown && shown.rows.length > 1 ? "these" : "this"} down now. It is not shown again. Each person must choose their own password the first time they log in.</Alert>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }} data-testid="temp-passwords">
          <tbody>{(shown?.rows ?? []).map((r) => (
            <tr key={r.login}><Box component="td" sx={{ py: 0.75, pr: 2 }}>{r.name}</Box><Box component="td" sx={{ py: 0.75, pr: 2, color: "text.secondary" }}>{r.login}</Box>
              <Box component="td" sx={{ py: 0.75, fontFamily: "monospace", fontSize: 16, fontWeight: 600, userSelect: "all" }}>{r.password}</Box></tr>
          ))}</tbody>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button><Button variant="contained" onClick={() => { setCopied(false); onClose(); }}>I have written it down</Button></DialogActions>
    </Dialog>
  );
}

/** Role of one person in each app of the company: "No access" or one role. */
function AppRoles({ apps, roles, value, onChange }: { apps: AppRow[]; roles: RoleRow[]; value: Record<number, number | null>; onChange: (v: Record<number, number | null>) => void }) {
  return (
    <Stack spacing={1.5}>
      {apps.map((a) => (
        <TextField key={a.appId} select size="small" label={a.name} value={value[a.appId] == null ? "" : String(value[a.appId])} inputProps={{ "data-testid": `role-in-${a.slug}` }}
          onChange={(e) => onChange({ ...value, [a.appId]: e.target.value === "" ? null : Number(e.target.value) })} helperText="The role decides every screen and action in this app.">
          <MenuItem value="">No access</MenuItem>
          {roles.filter((r) => !r.fullAccess).map((r) => <MenuItem key={r.id} value={String(r.id)}>{r.name}</MenuItem>)}
        </TextField>
      ))}
    </Stack>
  );
}

function Sees({ person }: { person: Person }) {
  if (!person.apps.length) return <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>No app yet: this person can log in and will see nothing.</Typography>;
  return (
    <Stack spacing={1.5} data-testid="person-sees">
      {person.apps.map((a) => {
        const menu = menuOf(a.slug, a.tags ?? []);
        return (
          <Box key={a.appId}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{a.appName} · {a.roleName}</Typography>
            {menu == null ? <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{(a.tags ?? []).length} permissions.</Typography>
              : menu.length === 0 ? <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No menu: this role works in no part of the app.</Typography>
                : menu.map((m) => (
                  <Box key={m.section} sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center", mt: 0.5 }}>
                    <Typography sx={{ fontSize: 12.5, color: "text.secondary", minWidth: 96 }}>{m.section}</Typography>
                    {m.screens.map((s) => <Chip key={s} size="small" label={s} variant="outlined" />)}
                  </Box>
                ))}
          </Box>
        );
      })}
    </Stack>
  );
}

export default function PeopleTab({ api, apps, roles, meId, onChanged }: { api: AdminApi; apps: AppRow[]; roles: RoleRow[]; meId: number; onChanged: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [counts, setCounts] = useState({ all: 0, active: 0, admins: 0 });
  const [error, setError] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [open, setOpen] = useState<Person | null>(null);
  const [shown, setShown] = useState<{ title: string; rows: { name: string; login: string; password: string }[] } | null>(null);
  const load = useCallback(() => { api.people().then((r) => { setPeople(r.people); setCounts(r.counts); setError([]); }, (e) => setError(problemsOf(e))); }, [api]);
  useEffect(load, [load]);
  const list = useMemo(() => (people ?? []).filter((p) => !search.trim() || `${p.name} ${p.login} ${p.apps.map((a) => a.roleName).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase())), [people, search]);
  const changed = () => { load(); onChanged(); };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
        <Button variant="contained" onClick={() => setAdding(true)} data-testid="add-person">Add a person</Button>
        <Button variant="outlined" onClick={() => setBulk(true)}>Add several</Button>
        <TextField size="small" placeholder="Search a name, login or role" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: "1 1 220px", maxWidth: 340 }} />
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{counts.all} people · {counts.active} active · {counts.admins} admin{counts.admins === 1 ? "" : "s"}</Typography>
      </Stack>
      <Problems list={error} />
      {!people && !error.length && <CircularProgress size={24} />}
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", overflow: "hidden" }} data-testid="people">
        {list.map((p) => (
          <Box key={p.id} data-testid="person-row" sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", px: 2, py: 1.25, borderBottom: 1, borderColor: "divider", "&:last-child": { borderBottom: 0 }, opacity: p.active ? 1 : 0.6 }}>
            <Box sx={{ flex: "2 1 220px", minWidth: 0 }}>
              <Typography component="div" sx={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}{" "}
                {p.fullAccess && <Chip size="small" color="warning" label="Full access" title="Their base role is named admin: every check in every app passes." />}
                {p.admin && <Chip size="small" color="primary" label="Admin" sx={{ ml: 0.5 }} />}
                {!p.active && <Chip size="small" color="error" label="Deactivated" sx={{ ml: 0.5 }} />}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary", overflowWrap: "anywhere" }}>
                {p.login} · {p.lastLoginAt ? `last login ${when(p.lastLoginAt)}` : p.mustChangePassword ? "has not logged in with their new password" : "no login recorded yet"}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", flex: "2 1 220px" }}>
              {p.apps.length ? p.apps.map((a) => <Chip key={a.appId} size="small" variant="outlined" label={`${a.appName} · ${a.roleName ?? "?"}`} />) : <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>no app</Typography>}
            </Box>
            <Button size="small" onClick={() => { api.person(p.id).then(setOpen, (e) => setError(problemsOf(e))); }}>Open</Button>
          </Box>
        ))}
        {people && list.length === 0 && <Typography sx={{ p: 2, fontSize: 14, color: "text.secondary" }}>Nobody matches.</Typography>}
      </Box>

      <AddPerson open={adding} api={api} apps={apps} roles={roles} onClose={() => setAdding(false)}
        onAdded={(r) => { setAdding(false); setShown({ title: `${r.person.name} was added`, rows: [{ name: r.person.name, login: r.person.login, password: r.tempPassword }] }); changed(); }} />
      <AddSeveral open={bulk} api={api} apps={apps} roles={roles} onClose={() => setBulk(false)}
        onAdded={(rows) => { setBulk(false); setShown({ title: `${rows.length} people were added`, rows: rows.map((x) => ({ name: x.name, login: x.login, password: x.tempPassword })) }); changed(); }} />
      <PersonDialog person={open} api={api} apps={apps} roles={roles} meId={meId} onClose={() => setOpen(null)} onSaved={(p) => { setOpen(p); changed(); }}
        onPassword={(p, pw) => setShown({ title: `New temporary password for ${p.name}`, rows: [{ name: p.name, login: p.login, password: pw }] })} />
      <PasswordDialog shown={shown} onClose={() => setShown(null)} />
    </Box>
  );
}

function AddPerson({ open, api, apps, roles, onClose, onAdded }: { open: boolean; api: AdminApi; apps: AppRow[]; roles: RoleRow[]; onClose: () => void; onAdded: (r: { person: Person; tempPassword: string }) => void }) {
  const [name, setName] = useState(""); const [login, setLogin] = useState(""); const [admin, setAdmin] = useState(false);
  const [access, setAccess] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false); const [problems, setProblems] = useState<string[]>([]);
  useEffect(() => { if (open) { setName(""); setLogin(""); setAdmin(false); setAccess({}); setProblems([]); } }, [open]);
  const save = async () => {
    setBusy(true); setProblems([]);
    try { onAdded(await api.addPerson({ name, login, apps: access, admin })); } catch (e) { setProblems(problemsOf(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add a person</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Problems list={problems} />
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus inputProps={{ "data-testid": "person-name" }} />
          <TextField label="Login" value={login} onChange={(e) => setLogin(e.target.value)} helperText="Their email — or, for someone with no email, a username such as ravi.stores" inputProps={{ "data-testid": "person-login" }} />
          <AppRoles apps={apps} roles={roles} value={access} onChange={setAccess} />
          <FormControlLabel control={<Checkbox checked={admin} onChange={(e) => setAdmin(e.target.checked)} />} label="Admin: may open this panel and manage people and roles" />
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={busy || !name.trim() || !login.trim()} onClick={() => void save()} data-testid="person-save">{busy ? "Adding…" : "Add"}</Button></DialogActions>
    </Dialog>
  );
}

/** Paste rows of "name, login, role" — one a line. Nothing is added unless every row is right. */
function AddSeveral({ open, api, apps, roles, onClose, onAdded }: { open: boolean; api: AdminApi; apps: AppRow[]; roles: RoleRow[]; onClose: () => void; onAdded: (rows: { name: string; login: string; role: string | null; tempPassword: string }[]) => void }) {
  const [text, setText] = useState(""); const [appId, setAppId] = useState<number | "">("");
  const [busy, setBusy] = useState(false); const [problems, setProblems] = useState<string[]>([]);
  useEffect(() => { if (open) { setText(""); setProblems([]); setAppId(apps.length === 1 ? apps[0].appId : ""); } }, [open, apps]);
  const rows = text.split("\n").map((l) => l.split(/\t|,/).map((x) => x.trim())).filter((c) => c.some(Boolean)).map(([name, login, role]) => ({ name: name ?? "", login: login ?? "", role: role ?? "" }));
  const save = async () => {
    setBusy(true); setProblems([]);
    try { onAdded((await api.addPeople(Number(appId), rows)).added); } catch (e) { setProblems(problemsOf(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Add several people</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>One person a line: <b>name, login, role</b>. Separate with commas, or paste three columns from a spreadsheet. The role is the name of one of your roles ({roles.filter((r) => !r.fullAccess).slice(0, 6).map((r) => r.name).join(", ")}{roles.length > 6 ? ", …" : ""}).</Typography>
          <Problems list={problems} />
          <TextField select size="small" label="They will use" value={appId === "" ? "" : String(appId)} onChange={(e) => setAppId(Number(e.target.value))} sx={{ maxWidth: 280 }}>
            {apps.map((a) => <MenuItem key={a.appId} value={String(a.appId)}>{a.name}</MenuItem>)}
          </TextField>
          <TextField multiline minRows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Ravi Kumar, ravi.stores, Stores\nAnita Rao, anita@example.com, Procurement"} inputProps={{ style: { fontFamily: "monospace", fontSize: 13.5 }, "data-testid": "bulk-text" }} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{rows.length} {rows.length === 1 ? "person" : "people"} read.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={busy || !rows.length || appId === ""} onClick={() => void save()}>{busy ? "Adding…" : `Add ${rows.length}`}</Button></DialogActions>
    </Dialog>
  );
}

function PersonDialog({ person, api, apps, roles, meId, onClose, onSaved, onPassword }: {
  person: Person | null; api: AdminApi; apps: AppRow[]; roles: RoleRow[]; meId: number; onClose: () => void; onSaved: (p: Person) => void; onPassword: (p: Person, pw: string) => void;
}) {
  const [name, setName] = useState(""); const [login, setLogin] = useState(""); const [admin, setAdmin] = useState(false);
  const [access, setAccess] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false); const [problems, setProblems] = useState<string[]>([]);
  useEffect(() => {
    if (!person) return;
    setName(person.name); setLogin(person.login); setAdmin(person.admin); setProblems([]);
    setAccess(Object.fromEntries(apps.map((a) => [a.appId, person.apps.find((x) => x.appId === a.appId)?.roleId ?? null])));
  }, [person, apps]);
  if (!person) return null;
  const self = person.id === meId;
  const was = Object.fromEntries(apps.map((a) => [a.appId, person.apps.find((x) => x.appId === a.appId)?.roleId ?? null]));
  const appsChanged = Object.fromEntries(Object.entries(access).filter(([k, v]) => was[Number(k)] !== v));
  const dirty = name !== person.name || login !== person.login || admin !== person.admin || Object.keys(appsChanged).length > 0;
  const run = async (fn: () => Promise<void>) => { setBusy(true); setProblems([]); try { await fn(); } catch (e) { setProblems(problemsOf(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle component="div" sx={{ fontSize: 20, fontWeight: 600 }}>{person.name}{!person.active && <Chip size="small" color="error" label="Deactivated" sx={{ ml: 1 }} />}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Problems list={problems} />
          {person.fullAccess && <Alert severity="warning">This person's base role is named "admin", so every check in every app passes for them, whatever role is chosen below.</Alert>}
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Login" value={login} onChange={(e) => setLogin(e.target.value)} helperText="An email, or a username" />
          <AppRoles apps={apps} roles={roles} value={access} onChange={setAccess} />
          <FormControlLabel control={<Checkbox checked={admin} disabled={self} onChange={(e) => setAdmin(e.target.checked)} />} label={self ? "Admin (you cannot take this off yourself)" : "Admin: may open this panel and manage people and roles"} />
          <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>What {person.name.split(" ")[0]} sees{dirty ? " (as saved — save to see the change)" : ""}</Typography>
            <Sees person={person} />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <Button disabled={busy} onClick={() => void run(async () => { const r = await api.resetPassword(person.id); onPassword(person, r.tempPassword); })} data-testid="reset-password">Reset password</Button>
        {!self && <Button color={person.active ? "error" : "primary"} disabled={busy} onClick={() => void run(async () => onSaved(await api.setActive(person.id, !person.active)))}>{person.active ? "Deactivate" : "Make active again"}</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={busy || !dirty} data-testid="person-update"
          onClick={() => void run(async () => onSaved(await api.savePerson(person.id, { ...(name !== person.name ? { name } : {}), ...(login !== person.login ? { login } : {}), ...(admin !== person.admin ? { admin } : {}), ...(Object.keys(appsChanged).length ? { apps: appsChanged } : {}) })))}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
