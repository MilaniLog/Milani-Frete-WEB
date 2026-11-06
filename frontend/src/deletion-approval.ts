export type AdminCredentials = { cod: string; password: string };
export type ApprovalOperation = 'delete' | 'edit';
export type ApprovalRequest = { operation: ApprovalOperation; execute: (credentials: AdminCredentials) => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: Error) => void };
let handler: ((request: ApprovalRequest) => void) | undefined;
export function registerDeletionApproval(next: typeof handler) { handler = next; return () => { if (handler === next) handler = undefined; }; }
export function requestDeletionApproval<T>(execute: (credentials: AdminCredentials) => Promise<T>, operation: ApprovalOperation = 'delete'): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!handler) { reject(new Error(`Esta ${operation === 'edit' ? 'edição' : 'exclusão'} requer autorização de administrador.`)); return; }
    handler({ operation, execute, resolve: value => resolve(value as T), reject });
  });
}
