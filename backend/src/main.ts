import { existsSync } from 'fs';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const expressStatic = require('express').static;

  const publicBasePath = process.env.PUBLIC_BASE_PATH || '/frete';

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (publicBasePath && publicBasePath !== '/' && req.url.indexOf(`${publicBasePath}/api`) === 0) {
      req.url = req.url.slice(publicBasePath.length) || '/';
    }
    next();
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const frontendDist =
    process.env.FRONTEND_DIST || join(process.cwd(), '..', 'frontend', 'dist');
  const frontendIndex = join(frontendDist, 'index.html');
  const server = app.getHttpAdapter().getInstance();

  if (existsSync(frontendIndex)) {
    if (publicBasePath && publicBasePath !== '/') {
      server.use(`${publicBasePath}/assets`, expressStatic(join(frontendDist, 'assets')));
      server.use(`${publicBasePath}/brand`, expressStatic(join(frontendDist, 'brand')));
      server.use(publicBasePath, expressStatic(frontendDist));
    }

    server.use('/assets', expressStatic(join(frontendDist, 'assets')));
    server.use('/brand', expressStatic(join(frontendDist, 'brand')));
    server.use(expressStatic(frontendDist));
  }

  await app.init();

  if (existsSync(frontendIndex)) {
    server.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.indexOf('/api') === 0) return next();
      if (publicBasePath && publicBasePath !== '/' && req.path.indexOf(`${publicBasePath}/api`) === 0) return next();
      return res.sendFile(frontendIndex);
    });
  }

  const port =
    process.env.PORT ||
    process.env.PORT_START ||
    process.env.PORT_MAIN ||
    process.env.PORT_APP ||
    process.env.NODE_PORT ||
    (Object.entries(process.env).find(
      ([key, value]) => key.indexOf('PORT_') === 0 && /^\d+$/.test(value || ''),
    ) || [])[1] ||
    3000;

  await app.listen(port);
  console.log(`Milani Frete backend listening on port ${port}`);
}

bootstrap();
