import { Server, Socket } from 'socket.io';
import { GameContract } from './contract';
import { GameLogic, GameLogicImplementation, initLogic } from './logic';
import { nanoid } from 'nanoid';
import { exhaustiveSwitch, isObject } from '@daria/shared';
import { z } from 'zod';

export type PlayerId = string;

export type GameServer<
  TContract extends GameContract,
  TImpl extends GameLogicImplementation<TContract>
> = {
  subscribe(socket: Socket): void;
  unsubscribe(socket: Socket): void;
  logic: GameLogic<TContract>;
};

export const initGameServer = <
  TContract extends GameContract,
  TImpl extends GameLogicImplementation<TContract>
>(
  io: Server,
  contract: TContract,
  impl: TImpl,
  { hydrateMode }: { hydrateMode: 'state' | 'history' } = { hydrateMode: 'state' }
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

    subscribe(socket) {
      socket.join(gameId);
      switch (hydrateMode) {
        case 'history':
          return io.to(socket.id).emit('game:history', logic.history);
        case 'state':
          return io.to(socket.id).emit('game:state', logic.state);
        default:
          exhaustiveSwitch(hydrateMode);
      }
    },

    unsubscribe(socket) {
      socket.leave(gameId);
    }
  };
};
