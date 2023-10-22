import { GameContract } from './contract';
import { Socket } from 'socket.io-client';
import { ActionName, GameLogic, GameLogicImplementation, initLogic } from './logic';
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
): GameClient<TContract> => {
  const logic = initLogic(contract, impl);

  socket.on('game:event', payload => {
    logic.commit(payload);
  });

  return {
    logic,

    send(type, input) {
      socket.emit('game:action', { type, input });
    }
  };
};
