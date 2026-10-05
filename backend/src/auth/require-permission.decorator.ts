import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from './permission.types';

export const PERMISSION_KEY = 'required_permission';

export const RequirePermission = (permission: PermissionKey) =>
  SetMetadata(PERMISSION_KEY, permission);
