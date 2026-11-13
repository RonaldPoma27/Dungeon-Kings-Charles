const base = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
let renewing: Promise<string> | null = null;
export const logout = () => {
  sessionStorage.removeItem("access");
  sessionStorage.removeItem("refresh");
};
async function refresh() {
  const res = await fetch(base + "/token/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: sessionStorage.getItem("refresh") }),
  });
  if (!res.ok) {
    logout();
    window.dispatchEvent(new Event("signed-out"));
    throw Error("Sesión vencida. Iniciá sesión nuevamente.");
  }
  const { access } = await res.json();
  sessionStorage.setItem("access", access);
  return access as string;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const send = (token: string | null) =>
    fetch(base + path, {
      method,
      cache: "no-store",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const token = sessionStorage.getItem("access");
  let res = await send(token);
  if (token && res.status === 401 && sessionStorage.getItem("refresh")) {
    renewing ??= refresh().finally(() => {
      renewing = null;
    });
    res = await send(await renewing);
  }
  if (res.status === 304) return null as T;
  const data = await res
    .json()
    .catch(() => ({ detail: "Respuesta inesperada del servidor." }));
  if (!res.ok)
    throw Error(
      typeof data === "string"
        ? data
        : Array.isArray(data)
          ? data.join(" ")
          : Object.entries(data)
              .map(([k, v]) => (k === "detail" ? v : k + " · " + v))
              .join(" "),
    );
  return data;
}
