import { ZodSchema, z } from 'zod';

export type GameContract = {
  state: ZodSchema;
  events: {
    [k: string]: ZodSchema;
  };
  actions: {
    [k: string]: ZodSchema;
  };
};

export const defineGameContract = <TContract extends GameContract>(contract: TContract) =>
  contract;
