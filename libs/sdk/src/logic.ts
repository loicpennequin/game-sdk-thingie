import { z } from 'zod';
import { GameContract } from './contract';
import { ZodInferOrType } from './type-utils';
import { AnyFunction, Values } from '@daria/shared';
import mitt, { Emitter } from 'mitt';
import { asyncQueue } from './utils';
import { createDraft, finishDraft } from 'immer';

type ActionDispatcher<TContract extends GameContract> = <
  TName extends ActionName<TContract>,
  TInput extends TContract['actions'][TName] = TContract['actions'][TName]
>(
  type: TName,
  input: z.infer<TInput>
) => void;

type EventDispatcher<TContract extends GameContract> = <
  TName extends EventName<TContract>,
  TInput extends TContract['events'][TName] = TContract['events'][TName]
>(arg: {
  type: TName;
  input: ZodInferOrType<TInput>;
}) => void;

export type GameLogicImplementation<TContract extends GameContract> = {
  initialState: GameState<TContract>;
  events: {
    [EventKey in keyof TContract['events']]: (ctx: {
      state: GameState<TContract>;
      readonly input: z.infer<TContract['events'][EventKey]>;
    }) => void;
  };
  actions: {
    [ActionKey in keyof TContract['actions']]: (ctx: {
      readonly state: GameState<TContract>;
      readonly input: z.infer<TContract['actions'][ActionKey]>;
      commit: EventDispatcher<TContract>;
    }) => void;
  };
};

export const defineGameImplementation = <
  TContract extends GameContract,
  TImpl extends GameLogicImplementation<TContract>
>(
  contract: TContract,
  impl: TImpl
) => impl;

type EventMap<TContract extends GameContract> = {
  [Key in keyof TContract['events']]: {
    type: Key;
    input: z.infer<TContract['events'][Key]>;
  };
};
export type GameEvent<TContract extends GameContract> = Values<EventMap<TContract>>;
export type GameEventHistory<TContract extends GameContract> = GameEvent<TContract>[];

type ActionListener<TContract extends GameContract> = <
  TName extends ActionName<TContract>
>(
  name: TName | '*',
  cb: (ctx: ActionEventContext<TContract, TName>) => void
) => () => void;

type CommitListener<TContract extends GameContract> = <
  TName extends EventName<TContract>
>(
  name: TName | '*',
  cb: (ctx: CommitEventContext<TContract, TName>) => void
) => () => void;

export type ActionName<TContract extends GameContract> = Extract<
  keyof TContract['actions'],
  string
>;
export type EventName<TContract extends GameContract> = Extract<
  keyof TContract['events'],
  string
>;

export type GameState<TContract extends GameContract> = z.infer<TContract['state']>;

type ActionEventPrefix = 'before-action' | 'after-action';
type CommitEventPrefix = 'before-commit' | 'after-commit';
type EventSuffix<TName extends string> = TName | '*';

type GameEmitterEventName<TContract extends GameContract> =
  | `${ActionEventPrefix}:${EventSuffix<ActionName<TContract>>}`
  | `${CommitEventPrefix}:${EventSuffix<EventName<TContract>>}`;

type ActionEventContext<
  TContract extends GameContract,
  TName extends ActionName<TContract>
> = {
  state: GameState<TContract>;
  action: { type: TName; input: z.infer<TContract['actions'][TName]> };
};
type CommitEventContext<
  TContract extends GameContract,
  TName extends EventName<TContract>
> = {
  state: GameState<TContract>;
  event: { type: TName; input: z.infer<TContract['events'][TName]> };
};

type GameEmitter<TContract extends GameContract> = Emitter<{
  [Key in GameEmitterEventName<TContract>]: Key extends `${infer Prefix}:${infer Suffix}`
    ? Prefix extends ActionEventPrefix
      ? Suffix extends ActionName<TContract>
        ? ActionEventContext<TContract, Suffix>
        : never
      : Prefix extends CommitEventPrefix
      ? Suffix extends EventName<TContract>
        ? CommitEventContext<TContract, Suffix>
        : never
      : never
    : never;
}>;

export type GameLogic<TContract extends GameContract> = {
  readonly state: GameState<TContract>;
  readonly history: GameEventHistory<TContract>;

  hydrateWithHistory(history: GameEventHistory<TContract>): void;
  hydrateWithState(state: GameState<TContract>): void;

  dispatch: ActionDispatcher<TContract>;
  commit: EventDispatcher<TContract>;

  onBeforeAction: ActionListener<TContract>;
  onAfterAction: ActionListener<TContract>;
  onBeforeEvent: CommitListener<TContract>;
  onAfterEvent: CommitListener<TContract>;
};

export const initLogic = <TContract extends GameContract>(
  contract: TContract,
  { initialState, actions, events }: GameLogicImplementation<TContract>
): GameLogic<TContract> => {
  let state = contract.state.parse(initialState) as GameState<TContract>;
  let history: GameEventHistory<TContract> = [];

  const interceptors = new Map<GameEmitterEventName<TContract>, Set<AnyFunction>>();
  const addInterceptor = (name: GameEmitterEventName<TContract>, cb: AnyFunction) => {
    if (!interceptors.has(name)) {
      interceptors.set(name, new Set());
    }

    interceptors.get(name)?.add(cb);
  };
  const removeInterceptor = (name: GameEmitterEventName<TContract>, cb: AnyFunction) => {
    const listeners = interceptors.get(name);
    if (!listeners) return;

    listeners.delete(cb);
  };
  const triggerInterceptor = (name: GameEmitterEventName<TContract>, ctx: any) => {
    const listeners = interceptors.get(name);
    if (!listeners) return;

    return Promise.all([...listeners].map(listener => listener(ctx)));
  };

  const actionQueue = asyncQueue();

  let _hasCommited = false;

  const commit: EventDispatcher<TContract> = async ({ type, input }) => {
    const schema = contract.events[type as keyof typeof contract.events];
    const validationResult = schema.safeParse(input);
    if (!validationResult.success) {
      return null;
    }

    _hasCommited = true;

    const ctx: CommitEventContext<TContract, typeof type> = {
      get state() {
        return state;
      },
      event: { type, input }
    };

    await triggerInterceptor(`before-commit:*`, ctx);
    await triggerInterceptor(`before-commit:${type}`, ctx);

    const draft = createDraft(state);
    events[type]({ state: draft, input: validationResult.data });
    state = finishDraft(draft);
    history.push({ type, input });

    await triggerInterceptor(`after-commit:*`, ctx);
    await triggerInterceptor(`after-commit:${type}`, ctx);
  };

  return {
    get state() {
      return state;
    },

    get history() {
      return history;
    },

    commit,

    dispatch(type, input) {
      actionQueue.add(async () => {
        const schema = contract.actions[type as keyof typeof contract.actions];

        const validationResult = schema.safeParse(input);
        if (!validationResult.success) {
          return null;
        }

        const ctx: ActionEventContext<TContract, typeof type> = {
          state,
          action: { type, input }
        };

        await triggerInterceptor(`before-action:*`, ctx);
        await triggerInterceptor(`before-action:${type}`, ctx);

        actions[type]({ state, commit, input: validationResult.data });

        await triggerInterceptor(`after-action:*`, ctx);
        await triggerInterceptor(`after-action:${type}`, ctx);
      });
    },

    hydrateWithHistory(events) {
      if (_hasCommited) {
        throw new Error('Cannot hydrate game: actions have already been dispatched');
      }

      const keys = Object.keys(contract.events);
      const historySchema = z
        .object({
          type: z
            .string()
            .refine(val => keys.includes(val))
            .transform(val => val as keyof TContract['events']),
          input: z.any()
        })
        .array();

      const validatedEvents = historySchema.safeParse(events);
      if (!validatedEvents.success) {
        throw new Error('Invalid history');
      }

      state = contract.state.parse(initialState);
      history = [];
      validatedEvents.data.forEach(event => commit(event as any));
    },

    hydrateWithState(newState) {
      const validatedState = contract.state.safeParse(newState);

      if (!validatedState.success) {
        throw new Error('Invalid history');
      }

      state = newState;
      history = [];
    },

    onBeforeAction(name, cb) {
      const eventName: GameEmitterEventName<TContract> = `before-action:${name}`;

      addInterceptor(eventName, cb);
      return () => removeInterceptor(eventName, cb);
    },

    onAfterAction(name, cb) {
      const eventName: GameEmitterEventName<TContract> = `after-action:${name}`;

      addInterceptor(eventName, cb);
      return () => removeInterceptor(eventName, cb);
    },

    onBeforeEvent(name, cb) {
      const eventName: GameEmitterEventName<TContract> = `before-commit:${name}`;

      addInterceptor(eventName, cb);
      return () => removeInterceptor(eventName, cb);
    },

    onAfterEvent(name, cb) {
      const eventName: GameEmitterEventName<TContract> = `after-commit:${name}`;

      addInterceptor(eventName, cb);
      return () => removeInterceptor(eventName, cb);
    }
  };
};
