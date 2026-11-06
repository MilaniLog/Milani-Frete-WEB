CREATE TABLE IF NOT EXISTS frete_vale_controles (
  id INT NOT NULL AUTO_INCREMENT,
  tipo VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

ALTER TABLE frete_lancamentos
  ADD COLUMN IF NOT EXISTS controle_id INT NULL;

ALTER TABLE frete_cupons
  ADD COLUMN IF NOT EXISTS controle_id INT NULL;

-- Preserva o ID atual de todos os lancamentos.
INSERT IGNORE INTO frete_vale_controles (id, tipo, created_at)
SELECT id, 'LANCAMENTO', created_at
FROM frete_lancamentos;

UPDATE frete_lancamentos
JOIN frete_vale_controles v
  ON v.id = frete_lancamentos.id
 AND v.tipo = 'LANCAMENTO'
SET frete_lancamentos.controle_id = frete_lancamentos.id
WHERE frete_lancamentos.controle_id IS NULL;

-- Preserva o ID do cupom quando ele ainda nao pertence a um lancamento.
INSERT IGNORE INTO frete_vale_controles (id, tipo, created_at)
SELECT c.id, 'CUPOM', c.created_at
FROM frete_cupons c
LEFT JOIN frete_lancamentos l ON l.id = c.id
WHERE l.id IS NULL;

UPDATE frete_cupons c
LEFT JOIN frete_lancamentos l ON l.id = c.id
SET c.controle_id = c.id
WHERE c.controle_id IS NULL
  AND l.id IS NULL;

-- Qualquer registro ainda sem controle recebe um novo numero acima da serie atual.
-- Isso tambem torna o script seguro caso o sistema antigo grave algo entre a
-- primeira aplicacao da migration e a publicacao do backend novo.
DROP PROCEDURE IF EXISTS backfill_frete_vale_controle;
DELIMITER $$
CREATE PROCEDURE backfill_frete_vale_controle()
BEGIN
  DECLARE finished INT DEFAULT 0;
  DECLARE source_kind VARCHAR(20);
  DECLARE source_id INT;
  DECLARE source_created DATETIME;
  DECLARE records CURSOR FOR
    SELECT kind, id, created_at
    FROM (
      SELECT 'LANCAMENTO' AS kind, id, created_at
      FROM frete_lancamentos
      WHERE controle_id IS NULL
      UNION ALL
      SELECT 'CUPOM' AS kind, id, created_at
      FROM frete_cupons
      WHERE controle_id IS NULL
    ) pending
    ORDER BY created_at, kind, id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;

  OPEN records;
  record_loop: LOOP
    FETCH records INTO source_kind, source_id, source_created;
    IF finished = 1 THEN
      LEAVE record_loop;
    END IF;
    INSERT INTO frete_vale_controles (tipo, created_at)
    VALUES (source_kind, source_created);
    IF source_kind = 'LANCAMENTO' THEN
      UPDATE frete_lancamentos
      SET controle_id = LAST_INSERT_ID()
      WHERE id = source_id;
    ELSE
      UPDATE frete_cupons
      SET controle_id = LAST_INSERT_ID()
      WHERE id = source_id;
    END IF;
  END LOOP;
  CLOSE records;
END$$
DELIMITER ;

CALL backfill_frete_vale_controle();
DROP PROCEDURE backfill_frete_vale_controle;

CREATE UNIQUE INDEX IF NOT EXISTS uk_frete_lancamento_controle
  ON frete_lancamentos (controle_id);

CREATE UNIQUE INDEX IF NOT EXISTS uk_frete_cupom_controle
  ON frete_cupons (controle_id);
