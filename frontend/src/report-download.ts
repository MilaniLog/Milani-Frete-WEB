import { api } from "./api";
export async function downloadReport(
  path: string,
  token: string,
  name: string,
  mime = "text/html;charset=utf-8",
) {
  const content = await api<string>(path, token, {}, "text");
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
