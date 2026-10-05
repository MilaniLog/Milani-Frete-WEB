export type AuthUser = {
  sub: number;
  cod: number;
  unit: number;
  isAdmin: boolean;
  deletionApprovedBy?: number;
};

export type AuthenticatedRequest = {
  user: AuthUser;
};
