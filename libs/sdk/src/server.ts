import { Server, Socket } from 'socket.io';
import { GameContract } from './contract';
import { GameEvent, GameLogic, GameLogicImplementation, initLogic } from './logic';
import { nanoid } from 'nanoid';
import { exhaustiveSwitch } from '@daria/shared';
import { z } from 'zod';
import { GameEventHistory } from '.';

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
  { historyHydrationMaxSize }: { historyHydrationMaxSize: number } = {
    historyHydrationMaxSize: 1000
  }
): GameServer<TContract, TImpl> => {
  const gameId = nanoid();
  const logic = initLogic(contract, impl);

  const eventCache = new Map<number, GameEventHistory<TContract>[number]>();

  logic.onAfterEvent('*', ctx => {
    const event = { ...ctx.event, id: ctx.id };
    eventCache.set(ctx.id, event);
    io.in(gameId).emit('game:event', event);
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

    socket.on('game:resync', ({ from, to }, ack) => {
      const events: GameEventHistory<TContract> = [];
      for (let i = from + 1; i < to; i++) {
        const event = eventCache.get(i);
        if (event) {
          events.push(event);
        }
      }
      ack(events);
    });
  });

  return {
    logic,

    subscribe(socket) {
      socket.join(gameId);
      if (logic.history.length > historyHydrationMaxSize) {
        io.to(socket.id).emit('game:state', {
          state: logic.state,
          nextEventId: logic.nextEventId
        });
      } else {
        io.to(socket.id).emit('game:history', logic.history);
      }
    },

    unsubscribe(socket) {
      socket.leave(gameId);
    }
  };
};
