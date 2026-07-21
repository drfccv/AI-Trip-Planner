export async function executeStatements(statements: Array<PromiseLike<unknown>>) {
  for (const statement of statements) await statement;
}
