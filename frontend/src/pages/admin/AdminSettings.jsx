import { useState } from "react";
import { Loader2, Save, Settings, ShieldCheck } from "lucide-react";
import { Alert, Button, Input } from "../../components/ui";
import { useAdminSettings, useFeatureFlags, useUpdateSetting } from "../../hooks/useSettings";

const groupOrder = ["General", "Licensing", "Downloads", "Payments", "Email", "Security", "WordPress Updater", "Maintenance"];

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

      {groupOrder.map((group) => (
        <SettingsGroup key={group} title={group} settings={data?.[group] || []} />
      ))}

      <FeatureFlagsSection />
    </div>
  );
}
