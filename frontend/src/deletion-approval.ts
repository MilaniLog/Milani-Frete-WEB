export type AdminCredentials = { cod: string; password: string };
export type ApprovalRequest = { execute: (credentials: AdminCredentials) => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: Error) => void };
let handler: ((request: ApprovalRequest) => void) | undefined;
export function registerDeletionApproval(next: typeof handler) { handler = next; return () => { if (handler === next) handler = undefined; }; }
export function requestDeletionApproval<T>(execute: (credentials: AdminCredentials) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!handler) { reject(new Error('Esta exclusão requer autorização de administrador.')); return; }
    handler({ execute, resolve: value => resolve(value as T), reject });
  });
}
