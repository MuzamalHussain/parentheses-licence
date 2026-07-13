import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
  withCredentials: true, // send cookies (refresh token)
  headers: { "Content-Type": "application/json" },
});

export const AUTH_SESSION_EXPIRED_EVENT = "auth:session-expired";

export function clearAuthSession() {
  localStorage.removeItem("accessToken");
  delete api.defaults.headers.common.Authorization;
}

const getRequestPath = (config = {}) => {
  const requestUrl = config.url || "";
  try {
    return new URL(requestUrl, config.baseURL || api.defaults.baseURL).pathname;
  } catch {
    return requestUrl;
  }
};

const isRefreshRoute = (path) => path.endsWith("/auth/refresh");
const isNonRefreshableAuthRoute = (path) =>
  [
    "/auth/login",
    "/auth/register",
    "/auth/logout",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
    "/auth/resend-verification",
    "/account/change-password",
  ].some((route) => path.endsWith(route));

// Request interceptor - attach access token.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else if (config.headers) delete config.headers.Authorization;
  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

// Response interceptor - auto-refresh protected API calls on 401.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const requestPath = getRequestPath(original);
    const accessToken = localStorage.getItem("accessToken");
    const shouldAttemptRefresh =
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      accessToken &&
      !isRefreshRoute(requestPath) &&
      !isNonRefreshableAuthRoute(requestPath);

    if (shouldAttemptRefresh) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post("/auth/refresh");
        const newToken = data.data.accessToken;
        localStorage.setItem("accessToken", newToken);
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (err) {
        processQueue(err, null);
        clearAuthSession();
        window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 401 && isRefreshRoute(requestPath)) {
      clearAuthSession();
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    }

    return Promise.reject(error);
  }
);

export default api;
