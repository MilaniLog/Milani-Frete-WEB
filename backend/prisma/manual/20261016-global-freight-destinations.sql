-- Consolida destinos em um cadastro global.
-- Execute apenas depois de fazer backup do banco.

START TRANSACTION;

UPDATE frete_destinos
SET nome = TRIM(nome);

UPDATE frete_destinos destino
JOIN (
  SELECT MIN(id) AS manter_id, MAX(ativo) AS ativo
  FROM frete_destinos
  GROUP BY nome
) grupo ON grupo.manter_id = destino.id
SET destino.ativo = grupo.ativo;

DELETE duplicado
FROM frete_destinos duplicado
JOIN frete_destinos manter
  ON duplicado.nome = manter.nome
 AND duplicado.id > manter.id;

ALTER TABLE frete_destinos
  DROP COLUMN unit,
  ADD UNIQUE INDEX frete_destinos_nome_key (nome);

COMMIT;
