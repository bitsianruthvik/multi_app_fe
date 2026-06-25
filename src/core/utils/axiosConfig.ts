import axios from "axios";

// Get API base URL from environment variable
const API_BASE_URL = import.meta.env.VITE_API_HOST || import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    "VITE_API_HOST is not defined. Please set it in your .env file.",
  );
}

// Remove trailing slash for consistency
export const API_HOST = API_BASE_URL.replace(/\/$/, "");

function extractSlugs() {
  try {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return { company: parts[0], app: parts[1] };
    }
  } catch (e) {
    console.error("Error extracting company/app from path:", e);
  }
  return { company: null, app: null };
}

const instance = axios.create({
  baseURL: `${API_HOST}/api`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

instance.interceptors.request.use(
  (config) => {
    const { company, app } = extractSlugs();
    if (company && app) {
      config.baseURL = `${API_HOST}/api/${company}/${app}`;
    } else {
      config.baseURL = `${API_HOST}/api`;
    }
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      const parts = window.location.pathname.split("/").filter(Boolean);
      const nonAppSegments = ["apps", "reset-password"];
      if (parts.length >= 2 && !nonAppSegments.includes(parts[1])) {
        // /:company/:app/... — redirect to company landing
        window.location.href = `/${parts[0]}`;
      } else if (parts.length >= 1) {
        window.location.href = `/${parts[0]}`;
      } else {
        window.location.href = `/select-company`;
      }
    }
    return Promise.reject(error);
  },
);

export default instance;

// Helper to build a full API URL for direct requests
export function buildFullApiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const { company, app } = extractSlugs();
  return company && app
    ? `${API_HOST}/api/${company}/${app}${p}`
    : `${API_HOST}/api${p}`;
}

// Helper to build a public API URL that ignores slugs
export function buildPublicApiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_HOST}/api/public${p}`;
}
