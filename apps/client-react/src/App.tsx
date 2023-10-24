import "./App.css";
import { useEffect, useSyncExternalStore, useRef } from "react";
import { io } from "socket.io-client";
import { initGameClient } from "@daria/sdk";
import { contract, implementation, randomInt } from "@daria/shared";

const socket = io(import.meta.env.VITE_API_URL, {
  transports: ["websocket"],
  autoConnect: true,
});
const client = initGameClient(socket, contract, implementation);
const getSnapshot = () => client.logic.state;
const CELL_SIZE = 48;

export const App = () => {
  const state = useSyncExternalStore(client.subscribe, getSnapshot);
  const playerElements = useRef<Record<string, HTMLElement>>({});

  useEffect(() => {
    const unsub = client.logic.onBeforeEvent("move", ({ event }) => {
      return new Promise<void>((resolve) => {
        const { position, playerId } = event.input;
        gsap.to(playerElements.current[playerId], {
          duration: 5,
          ease: Power2.easeOut,
          onComplete: resolve,
          top: CELL_SIZE * position.y,
          left: CELL_SIZE * position.x,
        });
      });
    });

    return unsub;
  }, []);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.code === "Enter") {
        client.send("move", {
          playerId: socket.id,
          position: {
            x: randomInt(client.logic.state.map.width - 1),
            y: randomInt(client.logic.state.map.height - 1),
          },
        });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const cells = Array.from({ length: state.map.width }, (_, y) =>
    Array.from({ length: state.map.height }, (_, x) => ({ x, y }))
  ).flat();

  return (
    <main>
      <div
        className="map"
        style={{ "--width": state.map.width, "--height": state.map.height }}
      >
        {cells.map((cell, index) => (
          <div
            className="cell"
            key={index}
            style={{
              "--x": cell.x + 1,
              "--y": cell.y + 1,
            }}
            onClick={() =>
              client.send("move", {
                playerId: socket.id,
                position: cell,
              })
            }
          />
        ))}

        {state.players.map((player) => (
          <div
            key={player.id}
            ref={(element) =>
              element && (playerElements.current[player.id] = element)
            }
            style={{
              "--x": player.position.x,
              "--y": player.position.y,
            }}
            className="player"
          />
        ))}
      </div>
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </main>
  );
};
