import { Server, Socket } from 'socket.io';
import { GameContract } from './contract';
import { GameLogic, GameLogicImplementation, initLogic } from './logic';
import { nanoid } from 'nanoid';
import { isObject } from '@daria/shared';
import { z } from 'zod';

export type PlayerId = string;

export type GameServer<
  TContract extends GameContract,
  TImpl extends GameLogicImplementation<TContract>
> = {
  join(socket: Socket): void;
  leave(socket: Socket): void;
  logic: GameLogic<TContract>;
};

export const initGameServer = <
  TContract extends GameContract,
  TImpl extends GameLogicImplementation<TContract>
>(
  io: Server,
  contract: TContract,
  impl: TImpl
): GameServer<TContract, TImpl> => {
  const gameId = nanoid();
  const logic = initLogic(contract, impl);

  logic.onAfterEvent('*', ctx => {
    io.in(gameId).emit('game:event', ctx.event);
  });

  io.on('connection', socket => {
    socket.on('game:action', action => {
      const validatedAction = z
        .object({
          type: z.string(),
          input: z.any()
        })
        .safeParse(action);
      if (!validatedAction.success) return;

      // action will be thoroughly validated in the dispatcher so it's fine to send any value
      logic.dispatch(action.type, action.input);
    });
  });

  return {
    logic,

    join(socket) {
      return socket.join(gameId);
    },

    leave(socket) {
      return socket.leave(gameId);
    }
  };
};
