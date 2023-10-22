import { AnyFunction, Nullable } from '@daria/shared';
import { Server } from 'http';
import { Server as IoServer } from 'socket.io';
import { config } from './config';

export const createIo = (server: Server) => {
  const handleCORS = (origin: Nullable<string>, callback: AnyFunction) => {
    if (!origin || config.CORS.ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('websocket CORS'));
    }
  };

  return new IoServer(server, {
    cors: {
      origin: handleCORS,
      methods: ['GET', 'POST']
    },
    pingInterval: 10_000
  });
};
