import { Boxes, CheckCircle2, Code2, Loader2, Plug, ShieldCheck, Store } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminMarketplaceDashboard, useMarketplaceAction } from "../../hooks/useLicenses";

function Panel({ title, icon: Icon, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-gray-500" />
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <p className="text-xl font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value || 0}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function Button({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function Row({ title, detail, status, action }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
        <p className="text-xs text-gray-500 truncate">{detail}</p>
      </div>
      <div className="flex items-center gap-2">
        {status && <StatusBadge status={status} />}
        {action}
      </div>
    </div>
  );
}

export default function AdminMarketplace() {
  const { data, isLoading } = useAdminMarketplaceDashboard();
  const action = useMarketplaceAction();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const installed = data?.installed || [];
  const catalog = data?.catalog || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
        <p className="text-sm text-gray-500 mt-0.5">Private extension catalog, lifecycle controls, compatibility, SDK capabilities, and permission isolation</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Installed" value={installed.length} />
        <Metric label="Catalog" value={catalog.length} />
        <Metric label="Updates" value={data?.availableUpdates?.length || 0} />
        <Metric label="Warnings" value={data?.compatibilityWarnings?.length || 0} />
        <Metric label="SDK Modules" value={data?.sdk?.modules?.length || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel title="Installed Extensions" icon={Plug}>
            <div className="space-y-3">
              {installed.map((extension) => (
                <Row
                  key={extension.id}
                  title={extension.name}
                  detail={`${extension.id} - ${extension.version}`}
                  status={extension.status}
                  action={(
                    <Button
                      disabled={action.isPending}
                      onClick={() => action.mutate({ action: extension.enabled ? "disable" : "enable", id: extension.id })}
                    >
                      <CheckCircle2 className="w-4 h-4" /> {extension.enabled ? "Disable" : "Enable"}
                    </Button>
                  )}
                />
              ))}
              {!installed.length && <p className="text-sm text-gray-500">No extensions installed.</p>}
            </div>
          </Panel>

          <Panel title="Marketplace Catalog" icon={Store}>
            <div className="space-y-3">
              {catalog.map((extension) => (
                <Row
                  key={extension.id}
                  title={extension.name}
                  detail={`${extension.author} - ${extension.description}`}
                  status={extension.installed ? "installed" : "available"}
                  action={!extension.installed && (
                    <Button disabled={action.isPending} onClick={() => action.mutate({ action: "install", id: extension.id })}>
                      <Boxes className="w-4 h-4" /> Install
                    </Button>
                  )}
                />
              ))}
            </div>
          </Panel>

          <Panel title="Permission Summary" icon={ShieldCheck}>
            <div className="grid md:grid-cols-2 gap-3">
              {(data?.permissionSummary || []).map((item) => (
                <Row key={item.id} title={item.id} detail={`${item.count} permissions - unrestricted ${item.unrestrictedAccess ? "yes" : "no"}`} status={item.sandboxed ? "sandboxed" : "review"} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="SDK Overview" icon={Code2}>
            <div className="space-y-3">
              {(data?.sdk?.modules || []).map((module) => (
                <Row key={module.id} title={module.id} detail={module.methods?.join(", ")} status={module.permission} />
              ))}
            </div>
          </Panel>

          <Panel title="Developer Portal" icon={Code2}>
            <div className="space-y-3">
              {(data?.developerPortal?.extensionTemplates || []).map((template) => (
                <Row key={template.id} title={template.name} detail={template.files?.join(", ")} status="template" />
              ))}
              <Row title="Publishing Guide" detail={data?.developerPortal?.publishingGuide} status="ready" />
              <Row title="Versioning Guide" detail={data?.developerPortal?.versioningGuide} status="ready" />
            </div>
          </Panel>

          <Panel title="Security" icon={ShieldCheck}>
            <div className="space-y-3">
              {Object.entries(data?.security || {}).map(([key, value]) => (
                <Row key={key} title={key.replace(/([A-Z])/g, " $1")} detail="Extension security control" status={value ? "enabled" : "disabled"} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
