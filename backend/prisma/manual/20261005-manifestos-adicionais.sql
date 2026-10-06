ALTER TABLE frete_carregamento_manifestos
  ADD COLUMN manifesto_adicional_1 VARCHAR(20) NULL AFTER manifestos,
  ADD COLUMN manifesto_adicional_2 VARCHAR(20) NULL AFTER manifesto_adicional_1,
  ADD COLUMN manifesto_adicional_3 VARCHAR(20) NULL AFTER manifesto_adicional_2;

CREATE INDEX idx_frete_manifesto_adicional_1
  ON frete_carregamento_manifestos (manifesto_adicional_1);

CREATE INDEX idx_frete_manifesto_adicional_2
  ON frete_carregamento_manifestos (manifesto_adicional_2);

CREATE INDEX idx_frete_manifesto_adicional_3
  ON frete_carregamento_manifestos (manifesto_adicional_3);
