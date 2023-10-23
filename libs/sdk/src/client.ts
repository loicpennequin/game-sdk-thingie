import { GameContract } from './contract';
import { Socket } from 'socket.io-client';
import {
  ActionName,
  GameEvent,
  GameEventHistory,
  GameLogic,
  GameLogicImplementation,
  initLogic
} from './logic';
import { z } from 'zod';

export type GameClient<TContract extends GameContract> = {
  send<TName extends ActionName<TContract>>(
    name: TName,
    input: z.infer<TContract['actions'][TName]>
  ): void;
  logic: GameLogic<TContract>;
};

export const initGameClient = <
  TContract extends GameContract,
  TImpl extends GameLogicImplementation<TContract>
>(
  socket: Socket,
  contract: TContract,
  impl: TImpl
): Promise<GameClient<TContract>> => {
  const logic = initLogic(contract, impl);

  const onReady = () => {
    socket.on('game:event', payload => {
      if (payload.id > logic.nextEventId) {
        socket.emit(
          'game:resync',
          logic.nextEventId,
          (missingevents: GameEventHistory<TContract>) => {
            missingevents.forEach(event => {
              logic.commit(event as any);
              logic.commit(payload);
            });
          }
        );
      } else {
        logic.commit(payload);
      }
    });
    return {
      logic,

      send<TName extends ActionName<TContract>>(
        type: TName,
        input: z.infer<TContract['actions'][TName]>
      ) {
        socket.emit('game:action', { type, input });
      }
    };
  };

  return new Promise(resolve => {
    socket.on('game:history', history => {
      logic.hydrateWithHistory(history);

      resolve(onReady());
    });

    socket.on('game:state', state => {
      logic.hydrateWithState(state);

      resolve(onReady());
    });
  });
};
