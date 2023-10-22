import { config } from './config';
import { createApp } from './app';
import http from 'http';
import { createIo } from './io';
import { initGameServer } from '@daria/sdk';
import { contract, implementation } from '@daria/shared';

const main = () => {
  const server = http.createServer(createApp());
  const io = createIo(server);

  const game = initGameServer(io, contract, implementation);

  io.on('connection', socket => {
    game.subscribe(socket);
    game.logic.dispatch('join', socket.id);

    socket.on('disconnect', () => {
      game.unsubscribe(socket);
      game.logic.dispatch('leave', socket.id);
    });
  });

  server.listen(config.PORT, () => {
    console.log(`Server ready on port ${config.PORT}`);
  });
};

main();
