<script setup lang="ts">
import { io } from "socket.io-client";
import { GameState, initGameClient } from "@daria/sdk";
import { Nullable, contract, implementation, randomInt } from "@daria/shared";
import { VNodeRef, ref } from "vue";

const socket = io(import.meta.env.VITE_API_URL, {
  transports: ["websocket"],
  autoConnect: true,
});

const CELL_SIZE = 48;
const playerElements = ref<Record<string, HTMLElement>>({});
const playerRef =
  (player: string): VNodeRef =>
  (el) => {
    if (!el) return;

    playerElements.value[player] = el as HTMLElement;
  };

const state = ref<Nullable<GameState<typeof contract>>>();

const client = initGameClient(socket, contract, implementation);

client.logic.onAfterEvent("*", (ctx) => {
  switch (ctx.event.type) {
    case "move":
      const playerId = ctx.event.input.playerId;

      gsap.to(playerElements.value[playerId], {
        duration: 0.2,
        ease: Power2.easeOut,
        onComplete: () => {
          state.value = ctx.state;
        },
        top: CELL_SIZE * ctx.event.input.position.y,
        left: CELL_SIZE * ctx.event.input.position.x,
      });
      break;
    default:
      state.value = ctx.state;
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Enter") {
    client.send("move", {
      playerId: socket.id,
      position: {
        x: randomInt(client.logic.state.map.width - 1),
        y: randomInt(client.logic.state.map.height - 1),
      },
    });
  }
});
</script>

<template>
  <main>
    {{ client.logic.nextEventId }}
    <div class="map" v-if="state">
      <template v-for="y in state.map.width">
        <div
          class="cell"
          v-for="x in state.map.height"
          :key="x"
          :style="{
            '--x': x,
            '--y': y,
          }"
          @click="
            client.send('move', {
              playerId: socket.id,
              position: { x: x - 1, y: y - 1 },
            })
          "
        />
      </template>
      <div
        v-for="player in state.players"
        :key="player.id"
        :ref="playerRef(player.id)"
        :style="{
          '--x': player.position.x,
          '--y': player.position.y,
        }"
        class="player"
      />
    </div>

    <pre>
      {{ state }}
    </pre>
  </main>
</template>

<style scoped>
main {
  display: grid;
  place-content: center;
}
.map {
  --width: v-bind("state?.map.width");
  --height: v-bind("state?.map.width");
  --cell-size: 48px;

  display: grid;
  position: relative;
  width: calc(var(--width) * var(--cell-size));
  height: calc(var(--height) * var(--cell-size));
  grid-template-columns: repeat(--width, 1fr);
  grid-template-rows: repeat(--width, 1fr);
  border: solid 1px black;
}

.cell {
  border: solid 1px black;
  grid-column: var(--x);
  grid-row: var(--y);
  background-color: #ddd;
}

.player {
  position: absolute;
  top: calc(var(--cell-size) * var(--y));
  left: calc(var(--cell-size) * var(--x));
  background-color: red;
  width: var(--cell-size);
  aspect-ratio: 1;
}
</style>
