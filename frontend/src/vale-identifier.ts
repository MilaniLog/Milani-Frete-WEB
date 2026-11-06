export type ValeIdentifiable = {
  id: number;
  controle_id?: number | null;
};

export const valeIdentifier = (record: ValeIdentifiable) =>
  record.controle_id ?? record.id;
