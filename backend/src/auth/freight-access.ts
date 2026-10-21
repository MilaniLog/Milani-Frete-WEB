import type { AuthUser } from './auth-user.types';

export const FREIGHT_PROFILES = ['OPERACAO', 'FINANCEIRO', 'RH'] as const;
export type FreightProfile = (typeof FREIGHT_PROFILES)[number];

export function hasGlobalFreightAccess(user: AuthUser) {
  return (
    user.isAdmin ||
    user.freightProfile === 'FINANCEIRO' ||
    user.freightProfile === 'RH'
  );
}
