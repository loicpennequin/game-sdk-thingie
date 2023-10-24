import { GameContract } from './contract';
import { Socket } from 'socket.io-client';
import {
  ActionName,
  GameEventHistory,
  GameLogic,
  GameLogicImplementation,
  GameState,
  initLogic
} from './logic';
import { z } from 'zod';
import { asyncQueue } from './utils';

export type GameClient<TContract extends GameContract> = {
  send<TName extends ActionName<TContract>>(
    name: TName,
    input: z.infer<TContract['actions'][TName]>
  ): void;
  subscribe(cb: (state: GameState<TContract>) => void): () => void;
  logic: GameLogic<TContract>;
};

export const initGameClient = <
  TContract extends GameContract,
  TImpl extends GameLogicImplementation<TContract>
>(
  socket: Socket,
  contract: TContract,
  impl: TImpl
): GameClient<TContract> => {
  const logic = initLogic(contract, impl);
  const queue = asyncQueue();

  const resync = (to: number) =>
    new Promise<void>(resolve => {
      socket.emit(
        'game:resync',
        { from: logic.nextEventId, to },
        (missingevents: GameEventHistory<TContract>) => {
          missingevents.forEach(event => {
            logic.commit(event as any);
          });
          resolve();
        }
      );
    });

  const onReady = () => {
    socket.on('game:event', payload => {
      queue.add(async () => {
        if (payload.id < logic.nextEventId) return;

        if (payload.id > logic.nextEventId) {
          await resync(payload.id);
        }

        logic.commit(payload);
      });
    });
  };

  socket.on('game:history', history => {
    logic.hydrateWithHistory(history);

    onReady();
  });

  socket.on('game:state', ({ state, nextEventId }) => {
    logic.hydrateWithState(state, nextEventId);

    onReady();
  });

  return {
    logic,

    subscribe(cb) {
      return logic.onAfterEvent('*', ctx => {
        cb(ctx.state);
      });
    },

    send<TName extends ActionName<TContract>>(
      type: TName,
      input: z.infer<TContract['actions'][TName]>
    ) {
      socket.emit('game:action', { type, input });
    }
  };
};
