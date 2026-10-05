export function validDocument(value: string): boolean {
  if (!/^(\d{11}|\d{14})$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digit = (base: string, weights: number[]) => {
    const rest =
      [...base].reduce((sum, n, i) => sum + Number(n) * weights[i], 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const cpf = value.length === 11;
  const firstWeights = cpf
    ? [10, 9, 8, 7, 6, 5, 4, 3, 2]
    : [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = cpf
    ? [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const base = value.slice(0, -2);
  return (
    digit(base, firstWeights) === Number(value.at(-2)) &&
    digit(value.slice(0, -1), secondWeights) === Number(value.at(-1))
  );
}
