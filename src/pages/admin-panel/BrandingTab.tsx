import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, IconButton, TextField, Typography } from "@mui/material";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import { useCompanyBrand } from "@core/brand/CompanyBrandContext";
import { inkOn, solidFor } from "@core/brand/companyBrand";
import { problemsOf, type AdminApi } from "./api";

/**
 * Admin panel › Branding (2026-11-26): the company's 3-6 colours and its logo. After saving, every app this company
 * uses paints with them (core/brand) — buttons, links, highlights, charts, the top bar's logo. The sign-in pages stay
 * CEOFactory's: they must not tell anyone which companies exist.
 */
const ROLES = [
  { name: "Primary", use: "Buttons, links, the selected menu, highlights" },
  { name: "Secondary", use: "Second buttons, tags" },
  { name: "Accent", use: "Small highlights, the third chart colour" },
  { name: "Extra 1", use: "Charts" },
  { name: "Extra 2", use: "Charts" },
  { name: "Extra 3", use: "Charts" },
];
const STARTER = ["#12236F", "#2C54FF", "#F2A900"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO = 300 * 1024;

export default function BrandingTab({ api, companyName }: { api: AdminApi; companyName: string }) {
  const { refresh } = useCompanyBrand();
  const [loaded, setLoaded] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [logo, setLogo] = useState("");
  const [saved, setSaved] = useState<{ colors: string[]; logo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.brand().then((b) => { setColors(b.colors); setLogo(b.logo); setSaved({ colors: b.colors, logo: b.logo }); setLoaded(true); }, (e) => { setProblems(problemsOf(e)); setLoaded(true); });
  }, [api]);

  const standard = colors.length === 0;
  const bad = colors.some((c) => !HEX.test(c));
  const changed = !saved || saved.logo !== logo || saved.colors.join() !== colors.join();
  const setAt = (i: number, v: string) => setColors((cs) => cs.map((c, j) => (j === i ? v : c)));

  const pickLogo = (f: File | undefined) => {
    setProblems([]);
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) { setProblems(["The logo must be a PNG, JPEG, WebP or SVG image."]); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      if (url.length > MAX_LOGO) { setProblems([`That file is too big (${Math.round(url.length / 1024)} KB as stored). The logo must be at most 300 KB: a PNG about 400 px wide, or an SVG, is plenty.`]); return; }
      setLogo(url);
    };
    reader.readAsDataURL(f);
  };

  const save = async () => {
    setBusy(true); setProblems([]); setDone("");
    try {
      const b = await api.saveBrand({ colors: colors.map((c) => c.toUpperCase()), logo });
      setColors(b.colors); setLogo(b.logo); setSaved({ colors: b.colors, logo: b.logo });
      await refresh();
      setDone("Saved. Every app of this company now uses these colours and this logo (others see it the next time a page loads).");
    } catch (e) { setProblems(problemsOf(e)); } finally { setBusy(false); }
  };

  if (!loaded) return <CircularProgress size={24} />;

  const shown = standard || bad ? STARTER : colors;
  const p = solidFor(shown[0]);
  const s = solidFor(shown[1]);
  const a = solidFor(shown[2]);

  return (
    <Box data-testid="branding" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.1fr) minmax(0,1fr)" }, gap: 3, alignItems: "start" }}>
      <Box>
        <Typography sx={{ fontSize: 13.5, color: "text.secondary", mb: 2 }}>
          Your company's colours and logo, used in every app after people sign in. The sign-in page itself stays the same for everyone.
        </Typography>
        {problems.length > 0 && <Alert severity="error" sx={{ mb: 2, whiteSpace: "pre-line" }} onClose={() => setProblems([])}>{problems.join("\n")}</Alert>}
        {done && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDone("")}>{done}</Alert>}

        {/* Colours */}
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", p: 2, mb: 2 }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Colours</Typography>
          {standard ? (
            <>
              <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 1.5 }}>The apps use their standard colours.</Typography>
              <Button variant="outlined" onClick={() => setColors(STARTER)} data-testid="brand-start">Use our own colours</Button>
            </>
          ) : (
            <>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>3 to 6 colours, most important first.</Typography>
              {colors.map((c, i) => {
                const ok = HEX.test(c);
                const darkened = ok && i < 3 && solidFor(c) !== c.toUpperCase();
                return (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.25 }}>
                    <Box component="input" type="color" value={ok ? c : "#000000"} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAt(i, e.target.value.toUpperCase())}
                      aria-label={`${ROLES[i].name} colour`} sx={{ width: 44, height: 40, p: 0.25, border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "transparent", cursor: "pointer", flexShrink: 0 }} />
                    <TextField size="small" value={c} onChange={(e) => setAt(i, e.target.value.trim())} error={!ok} sx={{ width: 118, flexShrink: 0 }}
                      slotProps={{ htmlInput: { maxLength: 7, "aria-label": `${ROLES[i].name} colour code`, "data-testid": `brand-color-${i}` } }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{ROLES[i].name}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                        {ROLES[i].use}{darkened ? ". Light, so a darker shade is used behind white text." : ""}
                      </Typography>
                    </Box>
                    {colors.length > 3 && (
                      <IconButton size="small" aria-label={`Remove ${ROLES[i].name}`} onClick={() => setColors((cs) => cs.filter((_, j) => j !== i))}><DeleteOutline fontSize="small" /></IconButton>
                    )}
                  </Box>
                );
              })}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 }}>
                {colors.length < 6 && <Button size="small" onClick={() => setColors((cs) => [...cs, cs[cs.length - 1] ?? "#888888"])}>Add a colour</Button>}
                <Button size="small" color="inherit" onClick={() => setColors([])}>Back to the standard colours</Button>
              </Box>
            </>
          )}
        </Box>

        {/* Logo */}
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", p: 2, mb: 2 }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Logo</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>PNG, JPEG, WebP or SVG, at most 300 KB. A wide logo on a transparent background looks best.</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            {logo ? <Box component="img" src={logo} alt="Logo" sx={{ height: 48, maxWidth: 220, objectFit: "contain", border: 1, borderColor: "divider", borderRadius: 1, p: 0.5, bgcolor: "#fff" }} /> : <Typography sx={{ fontSize: 14, color: "text.secondary" }}>No logo yet.</Typography>}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} data-testid="brand-logo-file" />
            <Button variant="outlined" size="small" onClick={() => file.current?.click()}>{logo ? "Change logo" : "Upload logo"}</Button>
            {logo && <Button size="small" color="inherit" onClick={() => setLogo("")}>Remove</Button>}
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          <Button variant="contained" disabled={busy || bad || !changed} onClick={() => void save()} data-testid="brand-save">{busy ? "Saving…" : "Save branding"}</Button>
          {changed && saved && <Button color="inherit" onClick={() => { setColors(saved.colors); setLogo(saved.logo); }}>Undo changes</Button>}
          {bad && <Typography sx={{ fontSize: 13, color: "error.main" }}>Every colour must look like #1A2B3C.</Typography>}
        </Box>
      </Box>

      {/* Preview: what the apps will look like */}
      <Box sx={{ position: { md: "sticky" }, top: 16 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary", mb: 1 }}>Preview{standard ? " (standard colours, shown as an example)" : ""}</Typography>
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: "#fff", color: "#1b2240" }} data-testid="brand-preview">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, height: 48, borderBottom: "1px solid #e5e7eb" }}>
            {logo ? <Box component="img" src={logo} alt="" sx={{ height: 28, maxWidth: 130, objectFit: "contain" }} /> : (
              <Box sx={{ width: 22, height: 22, borderRadius: "6px", bgcolor: p, color: inkOn(p), display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600 }}>{companyName.charAt(0).toUpperCase() || "C"}</Box>
            )}
            <Box sx={{ fontSize: 14, fontWeight: 600 }}>App</Box>
            <Box sx={{ ml: 1.5, fontSize: 13, px: 1, py: 0.5, borderRadius: 1, bgcolor: `${p}1A`, color: p, fontWeight: 600 }}>Orders</Box>
            <Box sx={{ fontSize: 13, px: 1, color: "#505f98" }}>Stock</Box>
          </Box>
          <Box sx={{ p: 2 }}>
            <Box sx={{ fontSize: 16, fontWeight: 700, mb: 1 }}>Today</Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Box sx={{ px: 1.75, py: 0.75, borderRadius: 1, bgcolor: p, color: inkOn(p), fontSize: 13.5, fontWeight: 600 }}>Save</Box>
              <Box sx={{ px: 1.75, py: 0.75, borderRadius: 1, bgcolor: s, color: inkOn(s), fontSize: 13.5, fontWeight: 600 }}>Second</Box>
              <Box sx={{ px: 1.75, py: 0.75, borderRadius: 1, border: `1px solid ${p}`, color: p, fontSize: 13.5, fontWeight: 600 }}>Cancel</Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 99, bgcolor: `${a}22`, color: a, fontSize: 12, fontWeight: 700, alignSelf: "center" }}>New</Box>
            </Box>
            <Box sx={{ fontSize: 13.5, mb: 1.5 }}>A <Box component="span" sx={{ color: p, fontWeight: 600, textDecoration: "underline" }}>link</Box> in the text.</Box>
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.75, height: 70 }} aria-label="Chart colours">
              {shown.map((c, i) => <Box key={i} sx={{ flex: 1, height: `${40 + ((i * 37) % 60)}%`, bgcolor: c, borderRadius: "4px 4px 0 0" }} />)}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
