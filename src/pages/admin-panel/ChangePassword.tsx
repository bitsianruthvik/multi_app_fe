import { useState } from "react";
import { Alert, Box, Button, Container, Stack, TextField, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { useAuth } from "@core/contexts/AuthContext";
import { adminApi, problemsOf } from "./api";

/**
 * /:company/apps/password — a person chooses their own password. Anyone can come here; someone whose password was set
 * by an admin (a new person, a reset) is sent here and can open nothing else until it is done (the server refuses).
 */
export default function ChangePassword() {
  const { company = "" } = useParams<{ company: string }>();
  const { user } = useAuth();
  const forced = !!(user as { mustChangePassword?: boolean } | null)?.mustChangePassword;
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false); const [problems, setProblems] = useState<string[]>([]);
  const mismatch = again.length > 0 && next !== again;
  const save = async () => {
    setBusy(true); setProblems([]);
    try {
      await adminApi(company).changePassword(current, next);
      // A full load: the session is read again, now without "must change".
      window.location.assign(`/${company}/apps`);
    } catch (e) { setProblems(problemsOf(e)); setBusy(false); }
  };
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", alignItems: "center" }}>
      <Container maxWidth="xs">
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", p: 3 }}>
          <Typography component="h1" sx={{ fontSize: 22, fontWeight: 600 }}>Choose your password</Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 0.5, mb: 2 }}>
            {forced ? "The password you were given is temporary. Choose your own to continue." : "Type your current password, then the new one."}
          </Typography>
          <Stack spacing={2}>
            {problems.length > 0 && <Alert severity="error" sx={{ whiteSpace: "pre-line" }}>{problems.join("\n")}</Alert>}
            <TextField label={forced ? "The password you were given" : "Current password"} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus autoComplete="current-password" id="pw-current" />
            <TextField label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} helperText="At least 8 characters" autoComplete="new-password" id="pw-next" />
            <TextField label="New password again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} error={mismatch} helperText={mismatch ? "The two do not match" : " "} autoComplete="new-password" id="pw-again" />
            <Button variant="contained" disabled={busy || !current || next.length < 8 || next !== again} onClick={() => void save()} data-testid="pw-save">{busy ? "Saving…" : "Save and continue"}</Button>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
