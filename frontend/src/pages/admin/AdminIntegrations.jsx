import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Plug, Power, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminIntegrations, useIntegrationAction } from "../../hooks/useLicenses";

export default function AdminIntegrations() {
  const { data, isLoading } = useAdminIntegrations();
  const action = useIntegrationAction();
  const categories = data?.categories || [];
  const integrations = data?.integrations || [];
  const [category, setCategory] = useState("Payments");
  const visible = useMemo(() => integrations.filter((item) => item.category === category), [integrations, category]);
  const [selectedId, setSelectedId] = useState("");
  const selected = integrations.find((item) => item.id === selectedId) || visible[0];
  const [form, setForm] = useState({});
  const [show, setShow] = useState({});

  useEffect(() => { setSelectedId(visible[0]?.id || ""); }, [category]);
  useEffect(() => { setForm(selected?.configuration || {}); setShow({}); }, [selected?.id, selected?.configuration]);

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;

  const save = () => {
    const replacing = (selected.fields || []).some((field) => field.secret && selected.secretConfigured?.[field.key] && form[field.key]);
    if (replacing && !window.confirm("Replace the configured secret values? Existing values cannot be recovered.")) return;
    action.mutate({ providerId: selected.id, action: "configure", body: { configuration: form } }, {
      onSuccess: () => setForm((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, selected.fields?.find((field) => field.key === key)?.secret ? "" : value])))
    });
  };
  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Integrations Center</h1><p className="text-sm text-gray-500">Configure external services and protected credentials.</p></div>
        <div className="flex items-center gap-2 text-sm"><ShieldCheck className="w-5 h-5 text-green-600" />Encryption: {data?.security?.encryption?.configured ? "Ready" : "APP_ENCRYPTION_KEY required"}</div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[['Providers', integrations.length], ['Connected', integrations.filter((i) => i.status === 'connected').length], ['Enabled', integrations.filter((i) => i.enabled).length], ['Errors', integrations.filter((i) => i.status === 'error').length]].map(([label, value]) => <div className="card p-4" key={label}><p className="text-xl font-bold">{value}</p><p className="text-xs text-gray-500">{label}</p></div>)}
      </div>
      <div className="card grid lg:grid-cols-[190px_240px_1fr] min-h-[540px] overflow-hidden">
        <nav className="border-r border-gray-100 p-3 space-y-1">{categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={`w-full text-left px-3 py-2 rounded text-sm ${category === item ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>{item}</button>)}</nav>
        <div className="border-r border-gray-100 p-3 space-y-2"><p className="px-2 text-xs font-semibold uppercase text-gray-400">{category}</p>{visible.length ? visible.map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full text-left p-3 rounded border ${selected?.id === item.id ? 'border-brand-300 bg-brand-50' : 'border-gray-100'}`}><div className="flex justify-between gap-2"><span className="font-medium text-sm">{item.name}</span><StatusBadge status={item.status} /></div><span className="text-xs text-gray-400">{item.enabled ? 'Enabled' : 'Disabled'}</span></button>) : <p className="text-sm text-gray-400 p-2">No providers in this category.</p>}</div>
        <section className="p-5">{selected ? <div className="space-y-5">
          <div className="flex justify-between gap-3"><div><h2 className="font-semibold text-lg">{selected.name}</h2><p className="text-xs text-gray-500">Last test: {selected.lastConnectionTestAt ? new Date(selected.lastConnectionTestAt).toLocaleString() : 'Never'}{selected.lastConnectionLatencyMs != null ? ` · ${selected.lastConnectionLatencyMs}ms` : ''}</p></div><button className="btn-secondary text-sm" disabled={action.isPending} onClick={() => action.mutate({ providerId: selected.id, action: 'enabled', body: { enabled: !selected.enabled } })}><Power className="w-4 h-4" />{selected.enabled ? 'Disable' : 'Enable'}</button></div>
          {selected.lastError && <div className="rounded bg-red-50 text-red-700 text-sm p-3">{selected.lastError}</div>}
          {selected.category === "Payments" && <div className="rounded-lg border border-gray-100 p-4"><p className="text-sm font-semibold text-gray-800">Setup progress</p><div className="grid sm:grid-cols-4 gap-2 mt-3 text-xs">{[["1", "Choose provider", true], ["2", "Save credentials", selected.installed], ["3", "Test connection", selected.status === "connected"], ["4", "Enable checkout", selected.enabled]].map(([step, label, done]) => <div key={step} className={`rounded p-2 ${done ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>{step}. {label}</div>)}</div><p className="text-xs text-gray-500 mt-3">Next: {!selected.installed ? "Complete the required fields and save securely." : selected.status !== "connected" ? "Test the provider connection and webhook capability." : !selected.enabled ? "Enable the provider after testing." : "Run a sandbox checkout."}</p></div>}
          <div className="grid md:grid-cols-2 gap-4">{(selected.fields || []).map((field) => <label key={field.key} className="block"><span className="text-sm font-medium text-gray-700">{field.label}{field.required ? " *" : ""}</span>{field.secret && selected.secretConfigured?.[field.key] && <span className="ml-2 text-xs text-green-600">Configured</span>}<div className="relative mt-1">{field.type === 'select' ? <select className="input" value={form[field.key] || ''} onChange={(e) => setValue(field.key, e.target.value)}><option value="">Select</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input className="input pr-16" readOnly={field.readonly} type={field.secret && !show[field.key] ? 'password' : field.type === 'number' ? 'number' : 'text'} value={form[field.key] ?? ''} placeholder={field.secret && selected.secretConfigured?.[field.key] ? '•••••••• (unchanged)' : ''} onChange={(e) => setValue(field.key, e.target.value)} />}{field.secret && <div className="absolute right-2 top-2 flex gap-1"><button type="button" title="Show or hide" onClick={() => setShow((v) => ({ ...v, [field.key]: !v[field.key] }))}>{show[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>{selected.secretConfigured?.[field.key] && <button type="button" title="Clear secret" onClick={() => window.confirm(`Clear ${field.label}?`) && setValue(field.key, null)}><Trash2 className="w-4 h-4 text-red-500" /></button>}</div>}</div>{field.description && <span className="block text-xs text-gray-400 mt-1">{field.description}</span>}</label>)}</div>
          <div className="flex gap-2"><button className="btn-primary" disabled={action.isPending} onClick={save}><Save className="w-4 h-4" />Save</button><button className="btn-secondary" disabled={action.isPending || !selected.installed} onClick={() => action.mutate({ providerId: selected.id, action: 'test' })}><RefreshCw className="w-4 h-4" />Test connection</button></div>
        </div> : <div className="h-full flex items-center justify-center text-gray-400"><Plug className="w-5 h-5 mr-2" />Select a provider</div>}</section>
      </div>
    </div>
  );
}
