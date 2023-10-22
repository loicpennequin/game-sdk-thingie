import 'express-async-errors';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { corsMiddleware } from './middlewares/cors';

export const createApp = () => {
  const app = express();

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(corsMiddleware);
  app.use(cookieParser(config.COOKIE.SECRET));
  app.use((req, res) => res.send(`Not Found: ${req.url}`));

  return app;
};
