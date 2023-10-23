<script setup lang="ts">
import { io } from "socket.io-client";
import { GameState, initGameClient } from "@daria/sdk";
import { Nullable, contract, implementation, randomInt } from "@daria/shared";
import { ref } from "vue";

const socket = io(import.meta.env.VITE_API_URL, {
  transports: ["websocket"],
  autoConnect: true,
});

const state = ref<Nullable<GameState<typeof contract>>>();
const nextEventId = ref(0);

const client = initGameClient(socket, contract, implementation);
client.logic.onAfterEvent("*", (ctx) => {
  state.value = ctx.state;
  nextEventId.value = client.logic.nextEventId;
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

        <div
          v-for="player in state.players"
          :key="player.id"
          :style="{
            '--x': player.position.x,
            '--y': player.position.y,
          }"
          class="player"
        />
      </template>
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
  --cell-size: 5rem;

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
