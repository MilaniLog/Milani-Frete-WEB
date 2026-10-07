import { existsSync } from 'fs';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const frontendDist =
    process.env.FRONTEND_DIST ?? join(process.cwd(), '..', 'frontend', 'dist');
  const frontendIndex = join(frontendDist, 'index.html');

  if (existsSync(frontendIndex)) {
    app.useStaticAssets(frontendDist);

    app
      .getHttpAdapter()
      .getInstance()
      .get('*', (req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/api')) return next();
        return res.sendFile(frontendIndex);
      });
  }

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
