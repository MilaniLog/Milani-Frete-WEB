import { requestDeletionApproval } from './deletion-approval';
export type Session = {
  accessToken: string;
  user: {
    id: number;
    cod: number;
    name: string;
    unit: number;
    isAdmin: boolean;
  };
  permissions: {
    unit: number;
    freight_service: boolean;
    freight_closure?: boolean;
  }[];
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  token?: string,
  options: RequestInit = {},
  format: "json" | "text" = "json",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique se o backend está disponível.",
    );
  }
  const data =
    response.ok && format === "text"
      ? await response.text()
      : await response.json().catch(() => null);
  if (response.status === 403 && data?.code === 'ADMIN_APPROVAL_REQUIRED' && options.method?.toUpperCase() === 'DELETE' && !JSON.parse(String(options.body || '{}')).admin_authorization) {
    return requestDeletionApproval(credentials => api<T>(path, token, {
      ...options, body: JSON.stringify({ ...JSON.parse(String(options.body || '{}')), admin_authorization: credentials }),
    }, format));
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status === 401 && token
        ? "Sua sessão expirou. Entre novamente."
        : Array.isArray(data?.message)
          ? data.message.join(" • ")
          : data?.message ||
            `Não foi possível concluir a solicitação (${response.status}).`,
    );
  return data as T;
}
