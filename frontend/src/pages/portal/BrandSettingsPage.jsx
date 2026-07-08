import { useEffect, useMemo, useState } from "react";
import { Image, Loader2, Paintbrush, RotateCcw, Save } from "lucide-react";
import { useBrandAction, useOrganizationBrand, useOrganizations } from "../../hooks/useAccount";

const themeFields = [
  ["primaryColor", "Primary"],
  ["secondaryColor", "Secondary"],
  ["accentColor", "Accent"],
  ["successColor", "Success"],
  ["warningColor", "Warning"],
  ["dangerColor", "Danger"],
  ["backgroundColor", "Background"],
  ["sidebarColor", "Sidebar"],
  ["headerColor", "Header"],
  ["buttonColor", "Buttons"],
];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export default function BrandSettingsPage() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data: brand, isLoading } = useOrganizationBrand(activeOrgId);
  const action = useBrandAction();
  const [draft, setDraft] = useState(null);
  const [assetField, setAssetField] = useState("primaryLogo");
  const [assetUrl, setAssetUrl] = useState("");

  useEffect(() => {
    if (brand) setDraft(brand);
  }, [brand]);

  const previewStyle = useMemo(() => ({
    backgroundColor: draft?.theme?.backgroundColor,
    color: draft?.theme?.secondaryColor,
    fontFamily: draft?.typography?.fontFamily,
    borderRadius: `${draft?.typography?.borderRadius || 8}px`,
  }), [draft]);

  if (!activeOrgId) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-bold text-gray-900">Brand Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Create or join an organization before configuring branding.</p>
      </div>
    );
  }

  if (isLoading || !draft) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>;
  }

  const update = (section, key, value) => setDraft((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  const saveBrand = () => action.mutate({ action: "update", organizationId: activeOrgId, body: draft });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brand Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Theme, assets, email identity, and white label options.</p>
        </div>
        <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
        </select>
      </div>

      <div className="grid xl:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Paintbrush className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Identity</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Display Name"><input className="input" value={draft.identity.displayName || ""} onChange={(e) => update("identity", "displayName", e.target.value)} /></Field>
              <Field label="Tagline"><input className="input" value={draft.identity.tagline || ""} onChange={(e) => update("identity", "tagline", e.target.value)} /></Field>
              <Field label="Website"><input className="input" value={draft.identity.website || ""} onChange={(e) => update("identity", "website", e.target.value)} /></Field>
              <Field label="Support Email"><input className="input" value={draft.identity.supportEmail || ""} onChange={(e) => update("identity", "supportEmail", e.target.value)} /></Field>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Theme</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {themeFields.map(([key, label]) => (
                <Field key={key} label={label}>
                  <div className="flex gap-2">
                    <input type="color" className="h-10 w-12 rounded border border-gray-200" value={draft.theme[key]} onChange={(e) => update("theme", key, e.target.value)} />
                    <input className="input font-mono" value={draft.theme[key]} onChange={(e) => update("theme", key, e.target.value)} />
                  </div>
                </Field>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Typography</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Font Family"><input className="input" value={draft.typography.fontFamily} onChange={(e) => update("typography", "fontFamily", e.target.value)} /></Field>
              <Field label="Base Font Size"><input className="input" type="number" value={draft.typography.baseFontSize} onChange={(e) => update("typography", "baseFontSize", Number(e.target.value))} /></Field>
              <Field label="Heading Scale"><input className="input" type="number" step="0.05" value={draft.typography.headingScale} onChange={(e) => update("typography", "headingScale", Number(e.target.value))} /></Field>
              <Field label="Border Radius"><input className="input" type="number" value={draft.typography.borderRadius} onChange={(e) => update("typography", "borderRadius", Number(e.target.value))} /></Field>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Image className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Asset Manager</h2>
            </div>
            <div className="grid md:grid-cols-[180px_1fr_auto] gap-3">
              <select className="input" value={assetField} onChange={(e) => setAssetField(e.target.value)}>
                {Object.keys(draft.assets).map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
              <input className="input" value={assetUrl} onChange={(e) => setAssetUrl(e.target.value)} placeholder="/assets/logo.png or https://..." />
              <button className="btn-secondary" onClick={() => action.mutate({ action: "asset", organizationId: activeOrgId, field: assetField, body: { url: assetUrl, contentType: "image/png" } })}>Save Asset</button>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">White Label</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {["hideParenthesesBranding", "hidePlatformReferences", "hideVersionFooter"].map((key) => (
                <label key={key} className="flex items-center gap-3 text-sm text-gray-700">
                  <input type="checkbox" checked={Boolean(draft.whiteLabel[key])} onChange={(e) => update("whiteLabel", key, e.target.checked)} />
                  {key}
                </label>
              ))}
              <Field label="Powered By Text"><input className="input" value={draft.whiteLabel.poweredByText || ""} onChange={(e) => update("whiteLabel", "poweredByText", e.target.value)} /></Field>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5 sticky top-6">
            <h2 className="font-semibold text-gray-900 mb-4">Preview</h2>
            <div className="border border-gray-100 p-4" style={previewStyle}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 flex items-center justify-center text-white font-bold" style={{ backgroundColor: draft.theme.primaryColor, borderRadius: `${draft.typography.borderRadius}px` }}>
                  {(draft.identity.displayName || "P").slice(0, 1)}
                </div>
                <div>
                  <p className="font-bold">{draft.identity.displayName}</p>
                  <p className="text-sm opacity-70">{draft.identity.tagline}</p>
                </div>
              </div>
              <button className="px-4 py-2 text-white text-sm font-medium" style={{ backgroundColor: draft.theme.buttonColor, borderRadius: `${draft.typography.borderRadius}px` }}>Primary Action</button>
              <p className="text-xs opacity-60 mt-6">{draft.whiteLabel.hideVersionFooter ? "" : draft.whiteLabel.poweredByText}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1" disabled={action.isPending} onClick={saveBrand}><Save className="w-4 h-4" /> Save</button>
              <button className="btn-secondary" disabled={action.isPending} onClick={() => action.mutate({ action: "reset", organizationId: activeOrgId })}><RotateCcw className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
