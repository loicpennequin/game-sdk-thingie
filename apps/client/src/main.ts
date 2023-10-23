import "./global.css";
import { createApp } from "vue";
import App from "./App.vue";
import gsap from "gsap";

gsap.install(window);

createApp(App).mount("#app");
