import { defineGameContract, defineGameImplementation } from '@daria/sdk';
import { z } from 'zod';
import { randomInt } from './utils/helpers';

const positionSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative()
});

const playerSchema = z.object({
  id: z.string(),
  position: positionSchema
});

export const contract = defineGameContract({
  state: z.object({
    map: z.object({
      width: z.number(),
      height: z.number()
    }),
    players: playerSchema.array()
  }),

  events: {
    addPlayer: playerSchema,

    removePlayer: z.string(),

    move: z.object({
      playerId: z.string(),
      position: positionSchema
    })
  },

  actions: {
    join: z.string(),

    leave: z.string(),

    move: z.object({
      playerId: z.string(),
      position: positionSchema
    })
  }
});

export const implementation = defineGameImplementation(contract, {
  initialState: {
    map: {
      width: 10,
      height: 10
    },
    players: []
  },
  events: {
    addPlayer({ input, state }) {
      state.players.push(input);
    },
    removePlayer({ input, state }) {
      const index = state.players.findIndex(p => p.id === input);
      if (index < 0) return;
      state.players.splice(index, 1);
    },
    move({ state, input }) {
      const player = state.players.find(p => p.id === input.playerId);
      if (!player) return;
      player.position = input.position;
    }
  },
  actions: {
    join({ input, commit, state }) {
      commit({
        type: 'addPlayer',
        input: {
          id: input,
          position: {
            x: randomInt(state.map.width - 1),
            y: randomInt(state.map.height - 1)
          }
        }
      });
    },

    leave({ input, commit }) {
      commit({ type: 'removePlayer', input });
    },

    move({ input, commit }) {
      commit({ type: 'move', input });
    }
  }
});
