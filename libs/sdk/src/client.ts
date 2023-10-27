import { GameContract } from './contract';
import { Socket } from 'socket.io-client';
import {
  ActionName,
  GameEvent,
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
  subscribe(
    cb: (state: Readonly<GameState<TContract>>, latestEvent: GameEvent<TContract>) => void
  ): () => void;
  logic: GameLogic<TContract>;
};

type ClientOptions = {
  debug: boolean;
};
export const initGameClient = <
  TContract extends GameContract,
  TImpl extends GameLogicImplementation<TContract>
>(
  socket: Socket,
  contract: TContract,
  impl: TImpl,
  opts: ClientOptions = { debug: false }
): GameClient<TContract> => {
  const logic = initLogic(contract, impl);

  if (opts.debug) {
    logic.onBeforeAction('*', ctx => {
      console.groupCollapsed(`before-action:${ctx.action.type as string}`);
      console.log(ctx);
      console.groupEnd();
    });
    logic.onAfterAction('*', ctx => {
      console.groupCollapsed(`after-action:${ctx.action.type as string}`);
      console.log(ctx);
      console.groupEnd();
    });
    logic.onBeforeEvent('*', ctx => {
      console.groupCollapsed(`before-commit:${ctx.event.type as string}:${ctx.id}`);
      console.log(ctx);
      console.groupEnd();
    });
    logic.onAfterEvent('*', ctx => {
      console.groupCollapsed(`after-commit:${ctx.event.type as string}:${ctx.id}`);
      console.log(ctx);
      console.groupEnd();
    });
  }
  const queue = asyncQueue();

  const resync = (to: number) =>
    new Promise<void>(resolve => {
      socket.emit(
        'game:resync',
        { from: logic.nextEventId, to },
        (missingevents: GameEventHistory<TContract>) => {
          if (opts.debug) {
            console.log(`resyncing events ${logic.nextEventId} to ${to}`);
          }
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

        return logic.commit(payload);
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
        cb(ctx.state, ctx.event);
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
