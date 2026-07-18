import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "../lib/api";

export const useAdminSettings = () =>
  useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api.get("/admin/settings").then((r) => r.data.data),
  });

export const useGeneralSettings = () =>
  useQuery({ queryKey: ["general-settings"], queryFn: () => api.get("/admin/settings/general").then((r) => r.data.data) });

export const useUpdateGeneralSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings) => api.patch("/admin/settings/general", { settings }).then((r) => r.data),
    onSuccess: () => { toast.success("General settings saved."); qc.invalidateQueries({ queryKey: ["general-settings"] }); },
    onError: (err) => toast.error(err.response?.data?.message || "Could not save General settings."),
  });
};

export const useUploadGeneralAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, file }) => { const body = new FormData(); body.append("file", file); return api.post(`/admin/settings/general/${kind}`, body, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data); },
    onSuccess: () => { toast.success("Brand asset updated."); qc.invalidateQueries({ queryKey: ["general-settings"] }); },
    onError: (err) => toast.error(err.response?.data?.message || "Could not upload image."),
  });
};
export const useEmailCenter=()=>useQuery({queryKey:["email-center"],queryFn:()=>api.get("/admin/settings/email").then(r=>r.data.data)});
export const useEmailHealth=()=>useQuery({queryKey:["email-health"],queryFn:()=>api.get("/admin/settings/email/health").then(r=>r.data.data)});
export const useEmailAction=()=>{const qc=useQueryClient();return useMutation({mutationFn:({action,payload})=>action==="save"?api.patch("/admin/settings/email",{settings:payload}):action==="password"?api.patch("/admin/settings/email/password",payload):action==="test"?api.post("/admin/settings/email/test-connection"):api.post("/admin/settings/email/send-test",{to:payload}),onSuccess:()=>{toast.success("Email action completed.");qc.invalidateQueries({queryKey:["email-center"]});qc.invalidateQueries({queryKey:["email-health"]});},onError:e=>toast.error(e.response?.data?.message||"Email action failed.")});};
export const usePaymentCenter=()=>useQuery({queryKey:["payment-center"],queryFn:()=>api.get("/admin/settings/payments").then(r=>r.data.data)});
export const usePaymentCenterAction=()=>{const qc=useQueryClient();return useMutation({mutationFn:({provider,action,payload,key})=>action==="test"?api.post(`/admin/settings/payments/${provider}/test`):action==="secret"?api.patch(`/admin/settings/payments/${provider}/secrets/${key}`,payload):api.patch(`/admin/settings/payments/${provider}`,{settings:payload}),onSuccess:()=>{toast.success("Payment provider updated.");qc.invalidateQueries({queryKey:["payment-center"]});},onError:e=>toast.error(e.response?.data?.message||"Payment action failed.")});};
export const useAIProvidersCenter=()=>useQuery({queryKey:["ai-providers-center"],queryFn:()=>api.get("/admin/settings/ai-providers").then(r=>r.data.data)});
export const useAIProviderCenterAction=()=>{const qc=useQueryClient();return useMutation({mutationFn:({provider,action,payload,key})=>action==="test"?api.post(`/admin/settings/ai-providers/${provider}/test`):action==="secret"?api.patch(`/admin/settings/ai-providers/${provider}/secrets/${key}`,payload):api.patch(`/admin/settings/ai-providers/${provider}`,payload),onSuccess:()=>{toast.success("AI provider updated.");qc.invalidateQueries({queryKey:["ai-providers-center"]});},onError:e=>toast.error(e.response?.data?.message||"AI provider action failed.")});};
export const useStorageCenter=()=>useQuery({queryKey:["storage-center"],queryFn:()=>api.get("/admin/settings/storage-center").then(r=>r.data.data)});export const useStorageAction=()=>{const qc=useQueryClient();return useMutation({mutationFn:({provider,action,payload,key})=>action==="test"?api.post(`/admin/settings/storage-center/${provider}/test`):action==="secret"?api.patch(`/admin/settings/storage-center/${provider}/secrets/${key}`,payload):api.patch(`/admin/settings/storage-center/${provider}`,payload),onSuccess:()=>{toast.success("Storage provider updated.");qc.invalidateQueries({queryKey:["storage-center"]});},onError:e=>toast.error(e.response?.data?.message||"Storage action failed.")});};

export const useSecurityCenter=()=>useQuery({queryKey:["security-center"],queryFn:()=>api.get("/admin/settings/security-center").then(r=>r.data.data)});
export const useSecurityHealth=()=>useQuery({queryKey:["security-health"],queryFn:()=>api.get("/admin/settings/security-health").then(r=>r.data.data)});
export const useSecurityAction=()=>{const qc=useQueryClient();return useMutation({mutationFn:({action,payload})=>action==="forceLogout"?api.post("/admin/settings/security-force-logout"):api.patch("/admin/settings/security-center",{settings:payload}),onSuccess:()=>{toast.success("Security policy updated.");qc.invalidateQueries({queryKey:["security-center"]});qc.invalidateQueries({queryKey:["security-health"]});},onError:e=>toast.error(e.response?.data?.message||"Security policy update failed.")});};

export const useFeatureFlags = () =>
  useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => api.get("/admin/settings/feature-flags").then((r) => r.data.data),
  });
export const useMaintenanceStatus=()=>useQuery({queryKey:["maintenance-status"],queryFn:()=>api.get("/admin/settings/maintenance-status").then(r=>r.data.data)});
export const useFeatureFlagAction=()=>{const qc=useQueryClient();return useMutation({mutationFn:({action,key,payload,keys,changes})=>action==="enable"?api.post(`/admin/settings/feature-flags/${key}/enable`):action==="disable"?api.post(`/admin/settings/feature-flags/${key}/disable`):action==="bulk"?api.post("/admin/settings/feature-flags/bulk",{keys,changes}):action==="maintenance"?api.patch("/admin/settings/maintenance-status",payload):api.patch(`/admin/settings/feature-flags/${key}`,payload),onSuccess:()=>{toast.success("Feature flags updated.");qc.invalidateQueries({queryKey:["feature-flags"]});qc.invalidateQueries({queryKey:["maintenance-status"]});},onError:e=>toast.error(e.response?.data?.message||"Feature flag update failed.")});};

export const usePaymentProviders = () =>
  useQuery({
    queryKey: ["payment-providers"],
    queryFn: () => api.get("/admin/settings/payment-providers").then((r) => r.data.data),
  });

export const useUpdateSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }) => api.patch(`/admin/settings/${encodeURIComponent(key)}`, { value }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Setting saved.");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error saving setting."),
  });
};
