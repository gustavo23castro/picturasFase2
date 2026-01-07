import axios from "axios";

const FALLBACK_API_BASE = "http://localhost:8080/api-gateway/";
const FALLBACK_SOCKET_BASE = "http://localhost:8080";

export const getApiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return FALLBACK_API_BASE;
  return `${window.location.protocol}//${window.location.hostname}:8080/api-gateway/`;
};

export const getSocketBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_SOCKET_URL)
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  if (typeof window === "undefined") return FALLBACK_SOCKET_BASE;
  return `${window.location.protocol}//${window.location.hostname}:8080`;
};

export const api = axios.create({
  baseURL: getApiBaseUrl(),
});
