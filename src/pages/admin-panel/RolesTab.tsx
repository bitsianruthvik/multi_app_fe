import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { problemsOf, type AdminApi, type AppRow, type Role, type RoleApp, type RoleRow } from "./api";
import { menuOf } from "./sees";

const Problems = ({ list }: { list: string[] }) => (list.length ? <Alert severity="error" sx={{ whiteSpace: "pre-line" }}>{list.join("\n")}</Alert> : null);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The level a set of tags is at in a department: none, a level's key, or custom. */
function levelOf(dept: RoleApp["departments"][number], tags: Set<string>): string {
  const all = [...new Set(dept.levels.flatMap((l) => l.tags))];
  const held = all.filter((x) => tags.has(x));
  if (!held.length) return "none";
  return dept.levels.find((l) => l.tags.length === held.length && l.tags.every((x) => tags.has(x)))?.key ?? "custom";
}

/** One app of a role: departments with levels, approval ticks, switches, anything else, and the full list. */
function AppEditor({ app, tags, onChange }: { app: RoleApp; tags: Set<string>; onChange: (next: Set<string>) => void }) {
  const [showAll, setShowAll] = useState(false);
  const locked = useMemo(() => new Set(app.locked), [app.locked]);
  const set = (remove: string[], add: string[]) => { const n = new Set(tags); remove.filter((x) => !locked.has(x)).forEach((x) => n.delete(x)); add.forEach((x) => n.add(x)); onChange(n); };
  const toggle = (tag: string) => (tags.has(tag) ? set([tag], []) : set([], [tag]));
  const menu = menuOf(app.slug, [...tags]);
  const row = { display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" as const, px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" };
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }} data-testid={`role-app-${app.slug}`}>
      {!app.hasCatalog && <Alert severity="info" sx={{ borderRadius: 0 }}>{app.name} lists its permissions one by one; it has no departments and levels yet.</Alert>}
      {app.locked.length > 0 && <Alert severity="warning" sx={{ borderRadius: 0 }}>This role holds {app.locked.length} permission{app.locked.length === 1 ? "" : "s"} through an older company-wide grant. They show as ticked and cannot be changed here.</Alert>}
      {app.departments.map((d) => {
        const level = levelOf(d, tags);
        const all = [...new Set(d.levels.flatMap((l) => l.tags))];
        return (
          <Box key={d.key} sx={row} data-testid={`dept-${d.key}`}>
            <Box sx={{ flex: "2 1 240px", minWidth: 0 }}>
              <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{d.label}</Typography>
              {d.help && <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{d.help}</Typography>}
            </Box>
            <ToggleButtonGroup size="small" exclusive value={level} sx={{ flexWrap: "wrap" }}
              onChange={(_, v: string | null) => { if (!v || v === "custom") return; set(all, v === "none" ? [] : d.levels.find((l) => l.key === v)!.tags); }}>
              <ToggleButton value="none" sx={{ textTransform: "none", px: 1.25 }}>None</ToggleButton>
              {d.levels.map((l) => <ToggleButton key={l.key} value={l.key} sx={{ textTransform: "none", px: 1.25 }}>{l.label}</ToggleButton>)}
              {level === "custom" && <ToggleButton value="custom" sx={{ textTransform: "none", px: 1.25 }}>Custom</ToggleButton>}
            </ToggleButtonGroup>
          </Box>
        );
      })}
      {app.approvals.length > 0 && (
        <Box sx={{ ...row, alignItems: "flex-start" }} data-testid="approvals">
          <Box sx={{ flex: "1 1 180px", minWidth: 0 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>May approve</Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Each is a separate yes or no.</Typography>
          </Box>
          <Box sx={{ flex: "3 1 360px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {app.approvals.map((a) => <FormControlLabel key={a.tag} sx={{ m: 0 }} control={<Checkbox size="small" checked={tags.has(a.tag)} disabled={locked.has(a.tag)} onChange={() => toggle(a.tag)} />} label={<Typography sx={{ fontSize: 13.5 }}>{a.label}</Typography>} />)}
          </Box>
        </Box>
      )}
      {app.switches.map((s) => {
        const on = s.tags.every((x) => tags.has(x));
        return (
          <Box key={s.key} sx={row}>
            <Box sx={{ flex: "2 1 240px", minWidth: 0 }}>
              <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{s.label}</Typography>
              {s.help && <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{s.help}</Typography>}
            </Box>
            <ToggleButtonGroup size="small" exclusive value={on ? "on" : "off"} onChange={(_, v: string | null) => { if (v) set(s.tags, v === "on" ? s.tags : []); }}>
              <ToggleButton value="off" sx={{ textTransform: "none", px: 1.25 }}>No</ToggleButton>
              <ToggleButton value="on" sx={{ textTransform: "none", px: 1.25 }}>Yes</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        );
      })}
      {(app.other.length > 0 || !app.hasCatalog) && (
        <Box sx={{ ...row, alignItems: "flex-start" }}>
          <Box sx={{ flex: "1 1 180px" }}><Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{app.hasCatalog ? "Other permissions" : "Permissions"}</Typography></Box>
          <Box sx={{ flex: "3 1 360px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {(app.hasCatalog ? app.other : app.all).map((a) => <FormControlLabel key={a.tag} sx={{ m: 0 }} control={<Checkbox size="small" checked={tags.has(a.tag)} disabled={locked.has(a.tag)} onChange={() => toggle(a.tag)} />} label={<Typography sx={{ fontSize: 13.5 }}>{a.label}</Typography>} />)}
          </Box>
        </Box>
      )}
      {app.hasCatalog && (
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Button size="small" onClick={() => setShowAll((x) => !x)}>{showAll ? "Hide" : "Show"} all {app.all.length} permissions one by one</Button>
          <Collapse in={showAll}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", mt: 0.5 }} data-testid="all-permissions">
              {app.all.map((a) => <FormControlLabel key={a.tag} sx={{ m: 0 }} control={<Checkbox size="small" checked={tags.has(a.tag)} disabled={locked.has(a.tag)} onChange={() => toggle(a.tag)} />} label={<Typography sx={{ fontSize: 13 }}>{a.label}</Typography>} />)}
            </Box>
          </Collapse>
        </Box>
      )}
      <Box sx={{ px: 2, py: 1.25 }} data-testid="role-sees">
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>This role sees</Typography>
        {menu == null ? <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{tags.size} permission{tags.size === 1 ? "" : "s"} in {app.name}.</Typography>
          : menu.length === 0 ? <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No menu yet. View-only permissions open pages by link but put nothing in the menu.</Typography>
            : menu.map((m) => (
              <Box key={m.section} sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center", mt: 0.5 }}>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary", minWidth: 96 }}>{m.section}</Typography>
                {m.screens.map((s) => <Chip key={s} size="small" label={s} variant="outlined" />)}
              </Box>
            ))}
      </Box>
    </Box>
  );
}

function RoleDialog({ roleId, api, onClose, onChanged }: { roleId: number | null; api: AdminApi; onClose: () => void; onChanged: () => void }) {
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<Record<number, Set<string>>>({});
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false); const [problems, setProblems] = useState<string[]>([]);
  const take = useCallback((r: Role) => { setRole(r); setName(r.name); setTags(Object.fromEntries(r.apps.map((a) => [a.appId, new Set(a.tags)]))); }, []);
  useEffect(() => {
    setRole(null); setProblems([]); setTab(0);
    if (roleId != null) api.role(roleId).then((r) => { take(r); const i = r.apps.findIndex((a) => a.tags.length > 0); setTab(i < 0 ? 0 : i); }, (e) => setProblems(problemsOf(e)));
  }, [roleId, api, take]);
  if (roleId == null) return null;
  const app = role?.apps[tab];
  const changedApps = (role?.apps ?? []).filter((a) => !same([...(tags[a.appId] ?? [])], a.tags));
  const dirty = !!role && (name.trim() !== role.name || changedApps.length > 0);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setProblems([]); try { await fn(); } catch (e) { setProblems(problemsOf(e)); } finally { setBusy(false); } };
  const n = role?.people.length ?? 0;
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle component="div" sx={{ fontSize: 20, fontWeight: 600 }}>{role ? role.name : "Role"}{app?.standard && <Chip size="small" sx={{ ml: 1 }} color={app.standard.differs ? "warning" : "success"} label={app.standard.differs ? `Changed from standard ${app.standard.name}` : "Standard"} />}</DialogTitle>
      <DialogContent>
        {!role && !problems.length && <CircularProgress size={24} />}
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Problems list={problems} />
          {role?.fullAccess && <Alert severity="warning">A role named "admin" passes every check in every app, whatever is ticked here. Prefer the Admin tick on a person and a normal role.</Alert>}
          {role && <TextField label="Role name" value={name} disabled={role.fullAccess} onChange={(e) => setName(e.target.value)} sx={{ maxWidth: 380 }} />}
          {role && role.apps.length > 1 && <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable">{role.apps.map((a) => <Tab key={a.appId} label={`${a.name}${(tags[a.appId]?.size ?? 0) ? ` · ${tags[a.appId].size}` : ""}`} sx={{ textTransform: "none" }} />)}</Tabs>}
          {role && app && <AppEditor app={app} tags={tags[app.appId] ?? new Set()} onChange={(next) => setTags((t) => ({ ...t, [app.appId]: next }))} />}
          {role && (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }} data-testid="role-people">
              {n === 0 ? "Nobody holds this role yet." : `${n === 1 ? "1 person holds" : `${n} people hold`} this role: ${role.people.slice(0, 8).map((p) => p.name).join(", ")}${n > 8 ? ", …" : ""}. A change reaches them from their next page.`}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", rowGap: 1 }}>
        {role && n === 0 && !role.fullAccess && <Button color="error" disabled={busy} onClick={() => void run(async () => { await api.removeRole(role.id); onChanged(); onClose(); })}>Remove role</Button>}
        {role && app?.standard?.differs && <Button disabled={busy} onClick={() => void run(async () => { take(await api.resetRole(role.id, app.appId)); onChanged(); })} data-testid="role-reset">Reset to standard</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={busy || !dirty} data-testid="role-save"
          onClick={() => void run(async () => { take(await api.saveRole(role!.id, { ...(name.trim() !== role!.name ? { name: name.trim() } : {}), ...(changedApps.length ? { apps: Object.fromEntries(changedApps.map((a) => [a.appId, { tags: [...tags[a.appId]] }])) } : {}) })); onChanged(); })}>
          {n > 0 && changedApps.length ? `Save for ${n === 1 ? "1 person" : `${n} people`}` : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function NewRole({ open, api, apps, roles, copyOf, onClose, onMade }: { open: boolean; api: AdminApi; apps: AppRow[]; roles: RoleRow[]; copyOf: RoleRow | null; onClose: () => void; onMade: (id: number) => void }) {
  const [name, setName] = useState(""); const [from, setFrom] = useState("blank");
  const [busy, setBusy] = useState(false); const [problems, setProblems] = useState<string[]>([]);
  useEffect(() => { if (open) { setName(copyOf ? `${copyOf.name} (copy)` : ""); setFrom(copyOf ? `copy:${copyOf.id}` : "blank"); setProblems([]); } }, [open, copyOf]);
  const save = async () => {
    setBusy(true); setProblems([]);
    try {
      const [kind, a, b] = from.split(":");
      const r = await api.addRole({ name, ...(kind === "std" ? { standard: { appId: Number(a), key: b } } : kind === "copy" ? { copyOf: Number(a) } : {}) });
      onMade(r.id);
    } catch (e) { setProblems(problemsOf(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New role</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Problems list={problems} />
          <TextField label="Role name" value={name} onChange={(e) => setName(e.target.value)} autoFocus inputProps={{ "data-testid": "role-name" }} />
          <TextField select label="Start from" value={from} onChange={(e) => setFrom(e.target.value)} helperText="You can change anything after it is made.">
            <MenuItem value="blank">Nothing: an empty role</MenuItem>
            {apps.flatMap((a) => a.standards.map((s) => <MenuItem key={`std:${a.appId}:${s.key}`} value={`std:${a.appId}:${s.key}`}>Standard {a.name} role: {s.name}{s.help ? ` — ${s.help}` : ""}</MenuItem>))}
            {roles.filter((r) => !r.fullAccess).map((r) => <MenuItem key={`copy:${r.id}`} value={`copy:${r.id}`}>A copy of your role: {r.name}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={busy || !name.trim()} onClick={() => void save()} data-testid="role-create">{busy ? "Making…" : "Make the role"}</Button></DialogActions>
    </Dialog>
  );
}

export default function RolesTab({ api, apps, roles, onChanged }: { api: AdminApi; apps: AppRow[]; roles: RoleRow[] | null; onChanged: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [copyOf, setCopyOf] = useState<RoleRow | null>(null);
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        <Button variant="contained" onClick={() => { setCopyOf(null); setAdding(true); }} data-testid="add-role">New role</Button>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Start from a standard role, or copy one of yours. One person holds one role in each app.</Typography>
      </Stack>
      {!roles && <CircularProgress size={24} />}
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", overflow: "hidden" }} data-testid="roles">
        {(roles ?? []).map((r) => (
          <Box key={r.id} data-testid="role-row" sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", px: 2, py: 1.25, borderBottom: 1, borderColor: "divider", "&:last-child": { borderBottom: 0 } }}>
            <Box sx={{ flex: "2 1 240px", minWidth: 0 }}>
              <Typography component="div" sx={{ fontWeight: 600, fontSize: 14.5 }}>{r.name}{" "}
                {r.fullAccess && <Chip size="small" color="warning" label="Full access by name" />}
                {r.standard && <Chip size="small" color={r.standard.differs ? "warning" : "success"} variant="outlined" label={r.standard.differs ? `Changed from ${r.standard.name}` : "Standard"} />}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                {r.apps.length ? r.apps.map((a) => a.name).join(", ") : "no app yet"} · {r.people === 0 ? "nobody holds it" : r.people === 1 ? "1 person" : `${r.people} people`}
              </Typography>
            </Box>
            <Button size="small" onClick={() => setOpen(r.id)}>Open</Button>
            {!r.fullAccess && <Button size="small" onClick={() => { setCopyOf(r); setAdding(true); }}>Copy</Button>}
          </Box>
        ))}
      </Box>
      <NewRole open={adding} api={api} apps={apps} roles={roles ?? []} copyOf={copyOf} onClose={() => setAdding(false)} onMade={(id) => { setAdding(false); onChanged(); setOpen(id); }} />
      <RoleDialog roleId={open} api={api} onClose={() => setOpen(null)} onChanged={onChanged} />
    </Box>
  );
}
