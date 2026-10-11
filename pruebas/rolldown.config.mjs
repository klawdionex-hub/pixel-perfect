// Empaqueta las pruebas del bot para ejecutarlas con Node.  npm run prueba:bot
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));

export default {
  input: fileURLToPath(new URL("./bot.prueba.ts", import.meta.url)),
  platform: "node",
  resolve: { alias: { "@": `${raiz}src` } },
  external: [/^@supabase/],
  output: { file: fileURLToPath(new URL("../node_modules/.cache/prueba-bot.mjs", import.meta.url)), format: "esm" },
};
