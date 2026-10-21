import type { FreightProfile } from './freight-access';

export type AuthUser = {
  sub: number;
  cod: number;
  unit: number;
  isAdmin: boolean;
  freightProfile?: FreightProfile;
  deletionApprovedBy?: number;
};

export type AuthenticatedRequest = {
  user: AuthUser;
};
