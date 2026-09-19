import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Конфігурація збирача фронтенду.
 *
 * strictPort: true — якщо 5173 зайнятий, Vite впаде з помилкою,
 * а не мовчки візьме 5174. Це навмисно: інакше половина команди
 * працює на одному порту, половина на іншому, і CORS-налаштування
 * бекенду перестають збігатися.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
