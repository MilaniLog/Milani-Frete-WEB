import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { DeletionAuthorizationService } from './deletion-authorization.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),

        signOptions: {
          expiresIn: Number(
            configService.get<string>('JWT_EXPIRES_IN') ?? 28800,
          ),
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtAuthGuard, PermissionsGuard, DeletionAuthorizationService],

  exports: [AuthService, JwtModule, JwtAuthGuard, PermissionsGuard, DeletionAuthorizationService],
})
export class AuthModule {}
