import { apiUrl, ApiError } from "./api";
export async function downloadReport(
  path: string,
  token: string,
  name: string,
  mime = "text/html;charset=utf-8",
  reportWindow?: Window | null,
) {
  const response = await fetch(apiUrl(path), {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      response.status === 401 && token
        ? "Sua sessão expirou. Entre novamente."
        : Array.isArray(data?.message)
          ? data.message.join(" • ")
          : data?.message || `Não foi possível concluir a solicitação (${response.status}).`,
    );
  }
  const original = await response.blob();
  const content = original.type === mime
    ? original
    : new Blob([await original.arrayBuffer()], { type: mime });
  const url = URL.createObjectURL(content);
  if (reportWindow) {
    reportWindow.opener = null;
    reportWindow.location.href = url;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
