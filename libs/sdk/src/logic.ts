import { z } from 'zod';
import { GameContract } from './contract';
import { ZodInferOrType } from './type-utils';
import { Values } from '@daria/shared';
import mitt, { Emitter, EventType } from 'mitt';
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
>(
  arg: {
    type: TName;
    input: ZodInferOrType<TInput>;
  },
  opts?: { triggerListeners: boolean }
) => void;

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

type ActionMap<TContract extends GameContract> = {
  [Key in keyof TContract['actions']]: {
    type: Key;
    input: z.infer<TContract['actions'][Key]>;
  };
};
export type GameAction<TContract extends GameContract> = Values<ActionMap<TContract>>;

export type GameEventHistory<TContract extends GameContract> = (GameEvent<TContract> & {
  id: number;
})[];

type ActionListener<TContract extends GameContract> = <
  TName extends EventSuffix<ActionName<TContract>>
>(
  name: TName,
  cb: (ctx: ActionEventContext<TContract, TName>) => void
) => () => void;

type CommitListener<TContract extends GameContract> = <
  TName extends EventSuffix<EventName<TContract>>
>(
  name: TName,
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
  TName extends EventSuffix<ActionName<TContract>>
> = {
  state: GameState<TContract>;
  action: TName extends '*'
    ? GameAction<TContract>
    : { type: TName; input: z.infer<TContract['actions'][TName]> };
};

type CommitEventContext<
  TContract extends GameContract,
  TName extends EventSuffix<EventName<TContract>>
> = {
  state: GameState<TContract>;
  event: TName extends '*'
    ? GameEvent<TContract>
    : { type: TName; input: z.infer<TContract['events'][TName]> };
  id: number;
};

type GameEmitter<TContract extends GameContract> = Emitter<{
  [Key in GameEmitterEventName<TContract>]: Key extends `${infer Prefix}:${infer Suffix}`
    ? Prefix extends ActionEventPrefix
      ? Suffix extends EventSuffix<ActionName<TContract>>
        ? ActionEventContext<TContract, Suffix>
        : never
      : Prefix extends CommitEventPrefix
      ? Suffix extends EventSuffix<EventName<TContract>>
        ? CommitEventContext<TContract, Suffix>
        : never
      : never
    : never;
}>;

export type GameLogic<TContract extends GameContract> = {
  readonly state: GameState<TContract>;
  readonly history: GameEventHistory<TContract>;
  readonly nextEventId: number;

  hydrateWithHistory(history: GameEventHistory<TContract>): void;
  hydrateWithState(state: GameState<TContract>, nextEventId: number): void;

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
  let nextEventId = 0;

  const emitter = mitt<Record<EventType, any>>();

  const commit: EventDispatcher<TContract> = (
    event,
    opts = { triggerListeners: true }
  ) => {
    const { type, input } = event;
    const schema = contract.events[type as keyof typeof contract.events];
    const validationResult = schema.safeParse(input);
    if (!validationResult.success) {
      return null;
    }

    const id = nextEventId++;
    const ctx: CommitEventContext<TContract, typeof type> = {
      get state() {
        return state;
      },
      event: event as any,
      id
    };

    if (opts.triggerListeners) {
      emitter.emit(`before-commit:*`, ctx as any);
      emitter.emit(`before-commit:${type}`, ctx as any);
    }

    const draft = createDraft(state);
    events[type]({ state: draft, input: validationResult.data });
    state = finishDraft(draft);
    history.push({ type, input, id });

    if (opts.triggerListeners) {
      emitter.emit(`after-commit:*`, ctx as any);
      emitter.emit(`after-commit:${type}`, ctx as any);
    }
  };

  return {
    get state() {
      return state;
    },

    get history() {
      return history;
    },

    get nextEventId() {
      return nextEventId;
    },

    commit,

    dispatch(type, input) {
      const schema = contract.actions[type as keyof typeof contract.actions];

      const validationResult = schema.safeParse(input);
      if (!validationResult.success) {
        return null;
      }

      const ctx: ActionEventContext<TContract, typeof type> = {
        state,
        action: { type, input } as any
      };

      emitter.emit(`before-action:*`, ctx as any);
      emitter.emit(`before-action:${type}`, ctx as any);

      actions[type]({ state, commit, input: validationResult.data });

      emitter.emit(`after-action:*`, ctx as any);
      emitter.emit(`after-action:${type}`, ctx as any);
    },

    hydrateWithHistory(events) {
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
      validatedEvents.data.forEach(event => {
        commit(event as any, { triggerListeners: false });
      });
    },

    hydrateWithState(newState, id) {
      const validatedState = contract.state.safeParse(newState);

      if (!validatedState.success) {
        throw new Error('Invalid history');
      }

      state = newState;
      history = [];
      nextEventId = id;
    },

    onBeforeAction(name, cb) {
      const eventName = `before-action:${name}`;

      emitter.on(eventName, cb);
      return () => emitter.off(eventName, cb);
    },

    onAfterAction(name, cb) {
      const eventName = `after-action:${name}`;

      emitter.on(eventName, cb);
      return () => emitter.off(eventName, cb);
    },

    onBeforeEvent(name, cb) {
      const eventName = `before-commit:${name}`;

      emitter.on(eventName, cb);
      return () => emitter.off(eventName, cb);
    },

    onAfterEvent(name, cb) {
      const eventName = `after-commit:${name}`;

      emitter.on(eventName, cb);
      return () => emitter.off(eventName, cb);
    }
  };
};
