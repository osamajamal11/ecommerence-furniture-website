export function database(binding) {
  return {
    one: (sql, ...params) =>
      binding
        .prepare(sql)
        .bind(...params)
        .first(),
    all: async (sql, ...params) =>
      (
        await binding
          .prepare(sql)
          .bind(...params)
          .all()
      ).results,
    run: (sql, ...params) =>
      binding
        .prepare(sql)
        .bind(...params)
        .run(),
    batch: (items) =>
      binding.batch(
        items.map(([sql, ...params]) => binding.prepare(sql).bind(...params)),
      ),
  };
}
