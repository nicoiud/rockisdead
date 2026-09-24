/**
 * fetch para los clientes de Supabase en el servidor.
 * Next memoiza los GET idénticos dentro de un mismo render; en una base de datos
 * eso puede devolver datos viejos después de una escritura (ej. sincronizar un pago
 * y volver a leer el pedido). Un AbortSignal propio desactiva esa memoización.
 */
export const freshFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });
