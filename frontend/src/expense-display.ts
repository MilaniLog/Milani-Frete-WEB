export const expenseName = (code: unknown, name: unknown) =>
  String(code ?? "").trim() === "3333" ? "CTRB" : String(name ?? "");

export const expenseType = (code: unknown, type: unknown) =>
  String(code ?? "").trim() === "3333" ? "CTRB" : String(type ?? "");
