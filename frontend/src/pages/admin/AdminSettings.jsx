import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Settings, ShieldCheck } from "lucide-react";
import { Alert, Button, Input } from "../../components/ui";
import PaymentCenterSection from "./PaymentCenterSection";
import AIProvidersCenterSection from "./AIProvidersCenterSection";
import StorageCenterSection from "./StorageCenterSection";
import SecurityCenterSection from "./SecurityCenterSection";
import FeatureFlagCenterSection from "./FeatureFlagCenterSection";
import { useAdminSettings, useEmailAction, useEmailCenter, useEmailHealth, useFeatureFlags, useGeneralSettings, usePaymentProviders, useUpdateGeneralSettings, useUpdateSetting, useUploadGeneralAsset } from "../../hooks/useSettings";

const groupOrder = ["Licensing", "Downloads", "Payments", "Security", "WordPress Updater", "Maintenance"];

function EmailCenterSection(){const{data={},isLoading}=useEmailCenter();const{data:health}=useEmailHealth();const action=useEmailAction();const initial=useMemo(()=>Object.fromEntries(Object.entries(data).filter(([,v])=>Object.hasOwn(v,"value")).map(([k,v])=>[k,v.value])),[data]);const[form,setForm]=useState({});const[password,setPassword]=useState("");const[to,setTo]=useState("");useEffect(()=>setForm(initial),[initial]);if(isLoading)return <section className="card p-8"><Loader2 className="animate-spin"/></section>;const set=(k,v)=>setForm(x=>({...x,[k]:v}));return <section className="card p-5 space-y-5"><div className="flex justify-between"><div><h2 className="font-semibold">Email Center</h2><p className="text-sm text-gray-500">Operational SMTP configuration and diagnostics.</p></div><span className="text-sm font-medium">Status: {health?.status||"disconnected"}</span></div><div className="grid md:grid-cols-2 gap-3">{Object.entries(form).map(([key,value])=><label key={key} className="text-sm"><span>{key.replace("email.","")}</span>{typeof value==="boolean"?<input className="ml-2" type="checkbox" checked={value} onChange={e=>set(key,e.target.checked)}/>:<Input type={key.includes("Email")||key.includes("replyTo")?"email":key.includes("port")||key.includes("Timeout")||key.includes("Count")||key.includes("Limit")||key.includes("maximum")?"number":"text"} value={value??""} onChange={e=>set(key,e.target.type==="number"?Number(e.target.value):e.target.value)}/>}</label>)}</div><div className="grid md:grid-cols-[1fr_auto_auto] gap-2"><Input type="password" value={password} placeholder={data["email.smtp.password"]?.configured?"•••••••• (configured)":"SMTP password"} onChange={e=>setPassword(e.target.value)}/><Button disabled={!password||action.isPending} onClick={()=>action.mutate({action:"password",payload:{value:password}})}>Replace Password</Button><Button disabled={!data["email.smtp.password"]?.configured||action.isPending} onClick={()=>window.confirm("Clear SMTP password?")&&action.mutate({action:"password",payload:{clear:true}})}>Clear</Button></div><div className="flex flex-wrap gap-2"><Button onClick={()=>action.mutate({action:"save",payload:form})}>Save</Button><Button onClick={()=>action.mutate({action:"test"})}>Test Connection</Button><Input className="max-w-xs" type="email" value={to} placeholder="Test recipient" onChange={e=>setTo(e.target.value)}/><Button disabled={!to} onClick={()=>action.mutate({action:"send",payload:to})}>Send Test Email</Button></div><div className="grid sm:grid-cols-3 gap-2 text-xs"><span>Last test: {health?.lastTestTime?new Date(health.lastTestTime).toLocaleString():"Never"}</span><span>Last success: {health?.lastSuccessfulConnection?new Date(health.lastSuccessfulConnection).toLocaleString():"Never"}</span><span>Last failure: {health?.lastFailedConnection?new Date(health.lastFailedConnection).toLocaleString():"Never"}</span></div></section>}

function GeneralSettingsSection() {
  const { data = [], isLoading, error } = useGeneralSettings();
  const update = useUpdateGeneralSettings();
  const upload = useUploadGeneralAsset();
  const initial = useMemo(() => Object.fromEntries(data.map((item) => [item.key, item.value ?? ""])), [data]);
  const [values, setValues] = useState({});
  useEffect(() => setValues(initial), [initial]);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => { const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== initial[key]));
  const save = () => update.mutate(changed);
  const uploadFile = (kind, file) => { if (file) upload.mutate({ kind, file }); };

  if (isLoading) return <section className="bg-white border rounded-lg p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></section>;
  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"><div><h2 className="font-semibold text-gray-900">General</h2><p className="text-sm text-gray-500 mt-1">Portal identity, company details, regional formats, and brand assets.</p></div><Button type="button" onClick={save} loading={update.isPending} disabled={!dirty || update.isPending || upload.isPending}><Save className="w-4 h-4" /> Save changes</Button></div>
      {error && <div className="p-5"><Alert message={error.response?.data?.message || "Could not load General settings."} /></div>}
      {dirty && <div className="mx-5 mt-4 text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">You have unsaved General Settings changes.</div>}
      <div className="divide-y divide-gray-100">
        {data.map((setting) => {
          const asset = setting.key === "general.brandLogo" ? "logo" : setting.key === "general.favicon" ? "favicon" : null;
          return <div key={setting.key} className="grid lg:grid-cols-[1fr_360px] gap-4 px-5 py-4"><div><label htmlFor={setting.key} className="font-medium text-sm text-gray-900">{setting.label}</label><p className="text-sm text-gray-500 mt-1">{setting.description}</p></div><div>
            {asset ? <div className="space-y-2">{values[setting.key] && <img src={values[setting.key]} alt={`${setting.label} preview`} className="h-10 max-w-40 object-contain" />}<Input id={setting.key} type="file" accept={asset === "logo" ? "image/png,image/jpeg,image/webp" : "image/png,image/x-icon"} onChange={(event) => uploadFile(asset, event.target.files?.[0])} disabled={upload.isPending || update.isPending} /></div> : setting.options?.length ? <select id={setting.key} value={values[setting.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [setting.key]: event.target.value }))} disabled={update.isPending} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">{setting.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <Input id={setting.key} type={setting.type === "email" ? "email" : setting.type === "url" ? "url" : "text"} required={setting.required} value={values[setting.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [setting.key]: event.target.value }))} disabled={update.isPending} />}
          </div></div>;
        })}
      </div>
    </section>
  );
}

function SettingInput({ setting }) {
  const [value, setValue] = useState(setting.value ?? "");
  const updateSetting = useUpdateSetting();

  const dirty = value !== (setting.value ?? "");
  const save = () => updateSetting.mutate({ key: setting.key, value });

  if (setting.isSecret) {
    return (
      <div className="flex items-center gap-3">
        <Input value={setting.maskedValue || "Not configured"} disabled className="font-mono" />
        <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-600 whitespace-nowrap">Env managed</span>
      </div>
    );
  }

  if (setting.type === "boolean") {
    return (
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-brand-600"
            checked={Boolean(value)}
            onChange={(e) => setValue(e.target.checked)}
            disabled={!setting.isEditable}
          />
          Enabled
        </label>
        <Button type="button" onClick={save} loading={updateSetting.isPending} disabled={!dirty || !setting.isEditable}>
          <Save className="w-4 h-4" /> Save
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Input
        type={setting.type === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => setValue(setting.type === "number" ? e.target.valueAsNumber : e.target.value)}
        disabled={!setting.isEditable}
      />
      <Button type="button" onClick={save} loading={updateSetting.isPending} disabled={!dirty || !setting.isEditable}>
        <Save className="w-4 h-4" /> Save
      </Button>
    </div>
  );
}

function SettingsGroup({ title, settings = [] }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {settings.map((setting) => (
          <div key={setting.key} className="grid lg:grid-cols-[1fr_320px] gap-4 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm text-gray-900">{setting.key}</p>
                {setting.isReserved && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    Reserved for {setting.reservedFor || "future phase"}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
            </div>
            <SettingInput setting={setting} />
          </div>
        ))}
      </div>
    </section>
  );
}

// Legacy component retained for compatibility while FeatureFlagCenterSection owns runtime controls.
// eslint-disable-next-line no-unused-vars
function FeatureFlagsSection() {
  const { data: flags = [], isLoading, error } = useFeatureFlags();

  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Feature Flags</h2>
      </div>
      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : error ? (
        <div className="p-5"><Alert message={error.response?.data?.message || "Could not load feature flags."} /></div>
      ) : (
        <div className="divide-y divide-gray-100">
          {flags.map((flag) => (
            <div key={flag.key} className="grid md:grid-cols-[1fr_120px] gap-3 px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm text-gray-900">{flag.key}</p>
                  {flag.reservedFor && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                      Reserved for {flag.reservedFor}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{flag.description}</p>
              </div>
              <div className="flex md:justify-end items-start gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${flag.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {flag.enabled ? "Enabled" : "Disabled"}
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">Read-only</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function providerBadgeClass(label) {
  if (label === "Operational") return "bg-green-50 text-green-700";
  if (label === "Disabled") return "bg-gray-100 text-gray-600";
  if (label === "Adapter Missing" || label === "Coming Soon") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

// Legacy status component retained for compatibility while Payment Center owns configuration.
// eslint-disable-next-line no-unused-vars
function PaymentProvidersSection() {
  const { data: providers = [], isLoading, error } = usePaymentProviders();

  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Payment Provider Status</h2>
      </div>
      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : error ? (
        <div className="p-5"><Alert message={error.response?.data?.message || "Could not load payment provider status."} /></div>
      ) : (
        <div className="divide-y divide-gray-100">
          {providers.map((provider) => (
            <div key={provider.id} className="grid lg:grid-cols-[1fr_360px] gap-4 px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm text-gray-900">{provider.name}</p>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${providerBadgeClass(provider.label)}`}>
                    {provider.label}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{provider.reason}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className={`font-semibold px-2.5 py-2 rounded ${provider.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {provider.enabled ? "Enabled" : "Disabled"}
                </span>
                <span className={`font-semibold px-2.5 py-2 rounded ${provider.configured ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {provider.configured ? "Configured" : "Not Configured"}
                </span>
                <span className={`font-semibold px-2.5 py-2 rounded ${provider.operational ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                  {provider.operational ? "Operational" : "Unavailable"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AdminSettings() {
  const { data, isLoading, error } = useAdminSettings();

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-brand-600" /> Settings
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Safety baseline settings foundation</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <ShieldCheck className="w-4 h-4 text-green-600" /> Admin only
        </div>
      </div>

      {error && <Alert message={error.response?.data?.message || "Could not load settings."} />}

      <GeneralSettingsSection />
      <EmailCenterSection />

      {groupOrder.map((group) => (
        <SettingsGroup key={group} title={group} settings={data?.[group] || []} />
      ))}

      <PaymentCenterSection />
      <AIProvidersCenterSection />
      <StorageCenterSection />
      <SecurityCenterSection />
      <FeatureFlagCenterSection />
    </div>
  );
}
