import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@core/contexts/AuthContext";
import { isAdminRole } from "@core/utils/roles";
import { AuthButton, AuthField, AuthFrame, AuthLink, AuthNote } from "@core/components/auth/AuthFrame";
import { adminApi, problemsOf } from "./api";

/**
 * /:company/apps/password — a person chooses their own password. Anyone can come here; someone whose password was set
 * by an admin (a new person, a reset) is sent here and can open nothing else until it is done (the server refuses).
 * Same frame as the sign-in pages (AuthFrame); every password box has the eye that shows what was typed (2026-11-26).
 */
export default function ChangePassword() {
  const { company = "" } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const forced = !!(user as { mustChangePassword?: boolean } | null)?.mustChangePassword;
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false); const [problems, setProblems] = useState<string[]>([]);
  const mismatch = again.length > 0 && next !== again;
  const save = async () => {
    setBusy(true); setProblems([]);
    try {
      await adminApi(company).changePassword(current, next);
      // A full load: the session is read again, now without "must change". Back into the app they signed in to
      // (the app list only when none is known).
      const app = localStorage.getItem("appSlug");
      window.location.assign(app ? `/${company}/${app}/${isAdminRole(user?.role) ? "admin/dashboard" : "dashboard"}` : `/${company}/apps`);
    } catch (e) { setProblems(problemsOf(e)); setBusy(false); }
  };
  return (
    <AuthFrame
      title="Choose your password"
      subtitle={forced ? "The password you were given is temporary. Choose your own to continue." : "Type your current password, then the new one."}
      footer={forced ? undefined : <AuthLink onClick={() => navigate(-1)}>Cancel</AuthLink>}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (!(busy || !current || next.length < 8 || next !== again)) void save(); }} noValidate>
        {problems.length > 0 && <AuthNote tone="error">{problems.join("\n")}</AuthNote>}
        <AuthField label={forced ? "The password you were given" : "Current password"} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus autoComplete="current-password" id="pw-current" />
        <AuthField label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} helperText="At least 8 characters" autoComplete="new-password" id="pw-next" />
        <AuthField label="New password again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} error={mismatch} helperText={mismatch ? "The two do not match" : " "} autoComplete="new-password" id="pw-again" />
        <AuthButton disabled={!current || next.length < 8 || next !== again} busy={busy} testId="pw-save">{busy ? "Saving…" : "Save and continue"}</AuthButton>
      </form>
    </AuthFrame>
  );
}
