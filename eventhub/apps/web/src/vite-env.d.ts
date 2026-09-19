/// <reference types="vite/client" />

/**
 * Типізація змінних оточення фронтенду.
 *
 * Vite віддає клієнту лише змінні з префіксом VITE_ — це не примха,
 * а захист: без префікса будь-який секрет із оточення потрапив би
 * у бандл, доступний у браузері.
 *
 * Лабораторна № 1, крок 5: створіть .env.example та .env.local
 * зі значенням VITE_API_URL=http://localhost:4010
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
