import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import toast from "react-hot-toast";

// ── Admin Dashboard ───────────────────────────────────────────────────────────
export const useAdminDashboard = () =>
  useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api.get("/admin/dashboard").then((r) => r.data.data),
    staleTime: 60_000,
  });

export const useAdminAnalytics = (scope = "executive", params = {}) =>
  useQuery({
    queryKey: ["admin-analytics", scope, params],
    queryFn: () => api.get(`/admin/analytics/${scope}`, { params }).then((r) => r.data.data),
    staleTime: 60_000,
  });

export const useAdminWorkflowOverview = () =>
  useQuery({
    queryKey: ["admin-workflows-overview"],
    queryFn: () => api.get("/admin/workflows/overview").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useAdminWorkflowJobs = (params = {}) =>
  useQuery({
    queryKey: ["admin-workflow-jobs", params],
    queryFn: () => api.get("/admin/workflows/jobs", { params }).then((r) => r.data.data),
    keepPreviousData: true,
  });

export const useAdminOperationsDashboard = (params = {}) =>
  useQuery({
    queryKey: ["admin-operations-dashboard", params],
    queryFn: () => api.get("/admin/operations/dashboard", { params }).then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useOperationsAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body = {} }) =>
      api.post(`/admin/operations/maintenance/${action}`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success("Operation completed.");
      qc.invalidateQueries({ queryKey: ["admin-operations-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-workflows-overview"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Operation failed."),
  });
};

export const useAdminIntegrations = () =>
  useQuery({
    queryKey: ["admin-integrations"],
    queryFn: () => api.get("/admin/integrations").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useIntegrationAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, action, body = {} }) =>
      api.post(`/admin/integrations/${providerId}/${action}`, body).then((r) => r.data),
    onSuccess: (_, { action }) => {
      toast.success(action === "test" ? "Connection tested." : "Integration updated.");
      qc.invalidateQueries({ queryKey: ["admin-integrations"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Integration action failed."),
  });
};

export const useAdminApiKeys = () =>
  useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: () => api.get("/admin/api-keys").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useCreateApiKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post("/admin/api-keys", body).then((r) => r.data),
    onSuccess: () => {
      toast.success("API key created.");
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not create API key."),
  });
};

export const useApiKeyAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }) => api.post(`/admin/api-keys/${id}/${action}`).then((r) => r.data),
    onSuccess: (_, { action }) => {
      toast.success(action === "rotate" ? "API key rotated." : "API key revoked.");
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "API key action failed."),
  });
};

export const useAdminWebhooks = (params = {}) =>
  useQuery({
    queryKey: ["admin-webhooks", params],
    queryFn: () => api.get("/admin/webhooks", { params }).then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useCreateWebhook = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post("/admin/webhooks", body).then((r) => r.data),
    onSuccess: () => {
      toast.success("Webhook created.");
      qc.invalidateQueries({ queryKey: ["admin-webhooks"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not create webhook."),
  });
};

export const useWebhookAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body = {} }) => {
      if (action === "retry") return api.post(`/admin/webhooks/deliveries/${id}/retry`, body).then((r) => r.data);
      if (action === "delete") return api.delete(`/admin/webhooks/${id}`).then((r) => r.data);
      return api.patch(`/admin/webhooks/${id}`, body).then((r) => r.data);
    },
    onSuccess: () => {
      toast.success("Webhook updated.");
      qc.invalidateQueries({ queryKey: ["admin-webhooks"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Webhook action failed."),
  });
};

// ── Admin Licenses ────────────────────────────────────────────────────────────
export const useDeveloperPortal = () =>
  useQuery({
    queryKey: ["developer-portal"],
    queryFn: () => api.get("/admin/developer-portal").then((r) => r.data.data),
    staleTime: 60_000,
  });

export const useDeveloperSearch = (q) =>
  useQuery({
    queryKey: ["developer-portal-search", q],
    queryFn: () => api.get("/admin/developer-portal/search", { params: { q } }).then((r) => r.data.data),
    enabled: Boolean(q),
    staleTime: 30_000,
  });

export const useSandboxExecute = () =>
  useMutation({
    mutationFn: (body) => api.post("/admin/developer-portal/sandbox/execute", body).then((r) => r.data.data),
    onError: (err) => toast.error(err.response?.data?.message || "Sandbox request failed."),
  });

export const useAdminRbac = (organizationId) =>
  useQuery({
    queryKey: ["admin-rbac", organizationId],
    queryFn: () => api.get("/admin/rbac", { params: { organizationId } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useRbacAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, organizationId, teamId, roleId, userId, body = {} }) => {
      const payload = { ...body, organizationId };
      if (action === "create-team") return api.post("/admin/rbac/teams", payload).then((r) => r.data);
      if (action === "archive-team") return api.post(`/admin/rbac/teams/${teamId}/archive`, payload).then((r) => r.data);
      if (action === "delete-team") return api.delete(`/admin/rbac/teams/${teamId}`, { data: payload }).then((r) => r.data);
      if (action === "assign-team") return api.post(`/admin/rbac/teams/${teamId}/members`, payload).then((r) => r.data);
      if (action === "remove-team") return api.delete(`/admin/rbac/teams/${teamId}/members/${userId}`, { data: payload }).then((r) => r.data);
      if (action === "create-role") return api.post("/admin/rbac/roles", payload).then((r) => r.data);
      if (action === "clone-role") return api.post(`/admin/rbac/roles/${roleId}/clone`, payload).then((r) => r.data);
      if (action === "update-role") return api.patch(`/admin/rbac/roles/${roleId}`, payload).then((r) => r.data);
      if (action === "archive-role") return api.post(`/admin/rbac/roles/${roleId}/archive`, payload).then((r) => r.data);
      if (action === "delete-role") return api.delete(`/admin/rbac/roles/${roleId}`, { data: payload }).then((r) => r.data);
      if (action === "assign-role") return api.post(`/admin/rbac/members/${userId}/roles`, payload).then((r) => r.data);
      if (action === "remove-role") return api.delete(`/admin/rbac/members/${userId}/roles/${roleId}`, { data: payload }).then((r) => r.data);
      throw new Error("Unknown RBAC action.");
    },
    onSuccess: (_, vars) => {
      toast.success("RBAC updated.");
      qc.invalidateQueries({ queryKey: ["admin-rbac", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "RBAC action failed."),
  });
};

export const useAdminIdentity = (organizationId) =>
  useQuery({
    queryKey: ["admin-identity", organizationId],
    queryFn: () => api.get("/admin/identity", { params: { organizationId } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useIdentityAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, organizationId, providerId, userId, sessionId, body = {} }) => {
      const payload = { ...body, organizationId };
      if (action === "policy") return api.patch("/admin/identity/policy", payload).then((r) => r.data);
      if (action === "provider") return api.post("/admin/identity/providers", payload).then((r) => r.data);
      if (action === "provider-status") return api.patch(`/admin/identity/providers/${providerId}/status`, payload).then((r) => r.data);
      if (action === "provider-test") return api.post(`/admin/identity/providers/${providerId}/test`, payload).then((r) => r.data);
      if (action === "revoke-session") return api.delete(`/admin/identity/sessions/${userId}/${sessionId}`, { data: payload }).then((r) => r.data);
      throw new Error("Unknown identity action.");
    },
    onSuccess: (_, vars) => {
      toast.success("Identity settings updated.");
      qc.invalidateQueries({ queryKey: ["admin-identity", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Identity action failed."),
  });
};

export const useAdminCompliance = (organizationId) =>
  useQuery({
    queryKey: ["admin-compliance", organizationId],
    queryFn: () => api.get("/admin/compliance", { params: { organizationId } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useComplianceAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, organizationId, holdId, userId, body = {} }) => {
      const payload = { ...body, organizationId };
      if (action === "policy") return api.patch("/admin/compliance/policy", payload).then((r) => r.data);
      if (action === "export") return api.post("/admin/compliance/exports", payload).then((r) => r.data);
      if (action === "hold") return api.post("/admin/compliance/legal-holds", payload).then((r) => r.data);
      if (action === "release-hold") return api.post(`/admin/compliance/legal-holds/${holdId}/release`, payload).then((r) => r.data);
      if (action === "anonymize") return api.post(`/admin/compliance/users/${userId}/anonymize`, payload).then((r) => r.data);
      throw new Error("Unknown compliance action.");
    },
    onSuccess: (_, vars) => {
      toast.success("Compliance action completed.");
      qc.invalidateQueries({ queryKey: ["admin-compliance", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Compliance action failed."),
  });
};

export const useAdminAI = (organizationId) =>
  useQuery({
    queryKey: ["admin-ai", organizationId],
    queryFn: () => api.get("/admin/ai", { params: { organizationId } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAIAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, organizationId, providerId, body = {} }) => {
      const payload = { ...body, organizationId };
      if (action === "provider") return api.post("/admin/ai/providers", payload).then((r) => r.data);
      if (action === "provider-health") return api.post(`/admin/ai/providers/${providerId}/health`, payload).then((r) => r.data);
      if (action === "model") return api.post("/admin/ai/models", payload).then((r) => r.data);
      if (action === "prompt") return api.post("/admin/ai/prompts", payload).then((r) => r.data);
      if (action === "usage") return api.post("/admin/ai/usage/track", payload).then((r) => r.data);
      throw new Error("Unknown AI action.");
    },
    onSuccess: (_, vars) => {
      toast.success("AI platform updated.");
      qc.invalidateQueries({ queryKey: ["admin-ai", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "AI action failed."),
  });
};

export const useAIAssistantHistory = () =>
  useQuery({
    queryKey: ["ai-assistant-history"],
    queryFn: () => api.get("/ai-assistant/conversations").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useAskAIAssistant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post("/ai-assistant/ask", body).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-assistant-history"] }),
    onError: (err) => toast.error(err.response?.data?.message || "Assistant request failed."),
  });
};

export const useAdminAIAssistant = (organizationId) =>
  useQuery({
    queryKey: ["admin-ai-assistant", organizationId],
    queryFn: async () => {
      const [history, stats] = await Promise.all([
        api.get("/admin/ai-assistant/conversations", { params: { organizationId } }).then((r) => r.data.data),
        api.get("/admin/ai-assistant/stats", { params: { organizationId } }).then((r) => r.data.data),
      ]);
      return { history, stats };
    },
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAskAdminAIAssistant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, question }) => api.post("/admin/ai-assistant/ask", { organizationId, question }).then((r) => r.data.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["admin-ai-assistant", vars.organizationId] }),
    onError: (err) => toast.error(err.response?.data?.message || "Assistant request failed."),
  });
};

export const useAdminAIBusiness = (organizationId, params = {}) =>
  useQuery({
    queryKey: ["admin-ai-business", organizationId, params],
    queryFn: async () => {
      const requestParams = { ...params, organizationId };
      const [dashboard, history] = await Promise.all([
        api.get("/admin/ai-business/dashboard", { params: requestParams }).then((r) => r.data.data),
        api.get("/admin/ai-business/history", { params: { organizationId, limit: 12 } }).then((r) => r.data.data),
      ]);
      return { dashboard, history };
    },
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAskAIBusiness = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, question, period }) =>
      api.post("/admin/ai-business/query", { organizationId, question, period }).then((r) => r.data.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["admin-ai-business", vars.organizationId] }),
    onError: (err) => toast.error(err.response?.data?.message || "Business insight request failed."),
  });
};

export const useAdminAIFraud = (organizationId, params = {}) =>
  useQuery({
    queryKey: ["admin-ai-fraud", organizationId, params],
    queryFn: async () => {
      const requestParams = { ...params, organizationId };
      const [dashboard, history] = await Promise.all([
        api.get("/admin/ai-fraud/dashboard", { params: requestParams }).then((r) => r.data.data),
        api.get("/admin/ai-fraud/history", { params: { organizationId, limit: 20 } }).then((r) => r.data.data),
      ]);
      return { dashboard, history };
    },
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAdminAIWorkflows = (organizationId) =>
  useQuery({
    queryKey: ["admin-ai-workflows", organizationId],
    queryFn: () => api.get("/admin/ai-workflows/dashboard", { params: { organizationId } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAIWorkflowAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, organizationId, id, body = {} }) => {
      const payload = { ...body, organizationId };
      if (action === "plan") return api.post("/admin/ai-workflows/plan", payload).then((r) => r.data.data);
      if (action === "policy") return api.post("/admin/ai-workflows/policies", payload).then((r) => r.data.data);
      if (["approve", "reject", "execute"].includes(action)) return api.post(`/admin/ai-workflows/approvals/${id}/${action}`, payload).then((r) => r.data.data);
      throw new Error("Unknown AI workflow action.");
    },
    onSuccess: (_, vars) => {
      toast.success("AI workflow updated.");
      qc.invalidateQueries({ queryKey: ["admin-ai-workflows", vars.organizationId] });
      qc.invalidateQueries({ queryKey: ["admin-workflows-overview"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "AI workflow action failed."),
  });
};

export const useAdminAICommand = (organizationId, params = {}) =>
  useQuery({
    queryKey: ["admin-ai-command", organizationId, params],
    queryFn: () => api.get("/admin/ai-command/dashboard", { params: { ...params, organizationId } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAICommandQuestion = () =>
  useMutation({
    mutationFn: ({ organizationId, question }) =>
      api.post("/admin/ai-command/command", { organizationId, question }).then((r) => r.data.data),
    onError: (err) => toast.error(err.response?.data?.message || "AI command failed."),
  });

export const useAdminAIReleaseHistory = (organizationId, productId = "") =>
  useQuery({
    queryKey: ["admin-ai-release", organizationId, productId],
    queryFn: () => api.get("/admin/ai-release/history", { params: { organizationId, productId } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAnalyzeAIRelease = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, productId, versionId }) =>
      api.post("/admin/ai-release/analyze", { organizationId, productId, versionId }).then((r) => r.data.data),
    onSuccess: (_, vars) => {
      toast.success("Release analysis generated.");
      qc.invalidateQueries({ queryKey: ["admin-ai-release", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Release analysis failed."),
  });
};

export const useAdminAIDeveloper = (organizationId) =>
  useQuery({
    queryKey: ["admin-ai-developer", organizationId],
    queryFn: async () => {
      const [dashboard, history] = await Promise.all([
        api.get("/admin/ai-developer", { params: { organizationId } }).then((r) => r.data.data),
        api.get("/admin/ai-developer/history", { params: { organizationId, limit: 20 } }).then((r) => r.data.data),
      ]);
      return { dashboard, history };
    },
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAIDeveloperAsk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post("/admin/ai-developer/ask", body).then((r) => r.data.data),
    onSuccess: (_, vars) => {
      toast.success("Developer guidance generated.");
      qc.invalidateQueries({ queryKey: ["admin-ai-developer", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Developer copilot request failed."),
  });
};

export const useAdminAIForecast = (organizationId) =>
  useQuery({
    queryKey: ["admin-ai-forecast", organizationId],
    queryFn: () => api.get("/admin/ai-forecast/history", { params: { organizationId, limit: 10 } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useGenerateAIForecast = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post("/admin/ai-forecast/generate", body).then((r) => r.data.data),
    onSuccess: (_, vars) => {
      toast.success("Forecast generated.");
      qc.invalidateQueries({ queryKey: ["admin-ai-forecast", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Forecast generation failed."),
  });
};

export const useAdminAIGovernance = (organizationId) =>
  useQuery({
    queryKey: ["admin-ai-governance", organizationId],
    queryFn: () => api.get("/admin/ai-governance", { params: { organizationId } }).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useAIGovernanceAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, organizationId, body = {} }) => {
      const payload = { ...body, organizationId };
      if (action === "policy") return api.post("/admin/ai-governance/policy", payload).then((r) => r.data.data);
      if (action === "enforce") return api.post("/admin/ai-governance/policy/enforce", payload).then((r) => r.data.data);
      if (action === "prompt") return api.post("/admin/ai-governance/prompts", payload).then((r) => r.data.data);
      if (action === "prompt-transition") return api.post("/admin/ai-governance/prompts/transition", payload).then((r) => r.data.data);
      if (action === "prompt-rollback") return api.post("/admin/ai-governance/prompts/rollback", payload).then((r) => r.data.data);
      if (action === "model-transition") return api.post("/admin/ai-governance/models/transition", payload).then((r) => r.data.data);
      if (action === "model-version") return api.post("/admin/ai-governance/models/version", payload).then((r) => r.data.data);
      throw new Error("Unknown AI governance action.");
    },
    onSuccess: (_, vars) => {
      toast.success("AI governance updated.");
      qc.invalidateQueries({ queryKey: ["admin-ai-governance", vars.organizationId] });
      qc.invalidateQueries({ queryKey: ["admin-ai", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "AI governance action failed."),
  });
};

export const useAdminLicenses = (params = {}) =>
  useQuery({
    queryKey: ["admin-licenses", params],
    queryFn: () => api.get("/admin/licenses", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useAdminLicense = (id) =>
  useQuery({
    queryKey: ["admin-license", id],
    queryFn: () => api.get(`/admin/licenses/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

export const useAdminLicenseSites = (id, enabled = true) =>
  useQuery({
    queryKey: ["admin-license-sites", id],
    queryFn: () => api.get(`/admin/licenses/${id}/sites`).then((r) => r.data.data),
    enabled: !!id && enabled,
  });

export const useAdminLicenseStats = () =>
  useQuery({
    queryKey: ["admin-license-stats"],
    queryFn: () => api.get("/admin/licenses/stats").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useCreateLicense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post("/admin/licenses", data).then((r) => r.data),
    onSuccess: () => {
      toast.success("License created.");
      qc.invalidateQueries({ queryKey: ["admin-licenses"] });
      qc.invalidateQueries({ queryKey: ["admin-license-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error creating license."),
  });
};

export const useLicenseAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body = {} }) =>
      api.post(`/admin/licenses/${id}/${action}`, body).then((r) => r.data),
    onSuccess: (_, { action }) => {
      const msgs = {
        suspend: "License suspended.",
        reinstate: "License reinstated.",
        revoke: "License revoked.",
        "reset-activations": "Activations reset.",
        activate: "License activated.",
        expire: "License expired.",
        cancel: "License cancelled.",
        renew: "License renewed.",
        transfer: "License transferred.",
        "change-plan": "License plan changed.",
        "extend-expiration": "Expiration extended.",
        "convert-trial": "Trial converted.",
        "convert-lifetime": "License converted to lifetime.",
        "manual-activate": "Domain manually activated.",
        "force-deactivate": "Domain force deactivated.",
        "site-action": "Site action completed.",
      };
      toast.success(msgs[action] || "Done.");
      qc.invalidateQueries({ queryKey: ["admin-licenses"] });
      qc.invalidateQueries({ queryKey: ["admin-license-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Action failed."),
  });
};

// ── Customer Licenses ─────────────────────────────────────────────────────────
export const useMyLicenses = (params = {}) =>
  useQuery({
    queryKey: ["my-licenses", params],
    queryFn: () => api.get("/licenses", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useMyLicense = (id) =>
  useQuery({
    queryKey: ["my-license", id],
    queryFn: () => api.get(`/licenses/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

export const useMyLicenseSites = (id, enabled = true) =>
  useQuery({
    queryKey: ["my-license-sites", id],
    queryFn: () => api.get(`/licenses/${id}/sites`).then((r) => r.data.data),
    enabled: !!id && enabled,
  });

export const useRenameSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licenseId, domain, siteName }) =>
      api.post(`/licenses/${licenseId}/rename-site`, { domain, siteName }).then((r) => r.data),
    onSuccess: (_, { licenseId }) => {
      toast.success("Site renamed.");
      qc.invalidateQueries({ queryKey: ["my-license-sites", licenseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to rename site."),
  });
};

export const useMyLicenseSummary = () =>
  useQuery({
    queryKey: ["my-license-summary"],
    queryFn: () => api.get("/licenses/summary").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useDeactivateDomain = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licenseId, domain }) =>
      api.post(`/licenses/${licenseId}/deactivate-domain`, { domain }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Domain deactivated. Slot is now free.");
      qc.invalidateQueries({ queryKey: ["my-licenses"] });
      qc.invalidateQueries({ queryKey: ["my-license-summary"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to deactivate domain."),
  });
};
