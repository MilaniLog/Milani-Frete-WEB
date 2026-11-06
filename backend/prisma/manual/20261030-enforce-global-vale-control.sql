-- Corrige registros legados sem numero global e impede novas duplicidades.
-- Executar uma unica vez.

DROP PROCEDURE IF EXISTS enforce_global_vale_control;
DELIMITER $$
CREATE PROCEDURE enforce_global_vale_control()
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
         OR EXISTS (
           SELECT 1
           FROM frete_lancamentos l
           WHERE l.controle_id = frete_cupons.controle_id
         )
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
      WHERE id = source_id AND controle_id IS NULL;
    ELSE
      UPDATE frete_cupons
      SET controle_id = LAST_INSERT_ID()
      WHERE id = source_id;
    END IF;
  END LOOP;
  CLOSE records;
END$$
DELIMITER ;

CALL enforce_global_vale_control();
DROP PROCEDURE enforce_global_vale_control;

-- Garante que todo numero ja preenchido tenha a origem registrada antes das FKs.
INSERT IGNORE INTO frete_vale_controles (id, tipo, created_at)
SELECT controle_id, 'LANCAMENTO', created_at
FROM frete_lancamentos;

INSERT IGNORE INTO frete_vale_controles (id, tipo, created_at)
SELECT controle_id, 'CUPOM', created_at
FROM frete_cupons;

ALTER TABLE frete_lancamentos
  MODIFY controle_id INT NOT NULL;

ALTER TABLE frete_cupons
  MODIFY controle_id INT NOT NULL;

ALTER TABLE frete_lancamentos
  ADD CONSTRAINT fk_frete_lancamento_controle
  FOREIGN KEY (controle_id) REFERENCES frete_vale_controles(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE frete_cupons
  ADD CONSTRAINT fk_frete_cupom_controle
  FOREIGN KEY (controle_id) REFERENCES frete_vale_controles(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS trg_frete_lancamento_controle_insert;
DROP TRIGGER IF EXISTS trg_frete_lancamento_controle_update;
DROP TRIGGER IF EXISTS trg_frete_cupom_controle_insert;
DROP TRIGGER IF EXISTS trg_frete_cupom_controle_update;

DELIMITER $$
CREATE TRIGGER trg_frete_lancamento_controle_insert
BEFORE INSERT ON frete_lancamentos
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM frete_cupons WHERE controle_id = NEW.controle_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Numero global de vale ja utilizado por cupom';
  END IF;
END$$

CREATE TRIGGER trg_frete_lancamento_controle_update
BEFORE UPDATE ON frete_lancamentos
FOR EACH ROW
BEGIN
  IF NEW.controle_id <> OLD.controle_id AND
     EXISTS (SELECT 1 FROM frete_cupons WHERE controle_id = NEW.controle_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Numero global de vale ja utilizado por cupom';
  END IF;
END$$

CREATE TRIGGER trg_frete_cupom_controle_insert
BEFORE INSERT ON frete_cupons
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM frete_lancamentos WHERE controle_id = NEW.controle_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Numero global de vale ja utilizado por lancamento';
  END IF;
END$$

CREATE TRIGGER trg_frete_cupom_controle_update
BEFORE UPDATE ON frete_cupons
FOR EACH ROW
BEGIN
  IF NEW.controle_id <> OLD.controle_id AND
     EXISTS (SELECT 1 FROM frete_lancamentos WHERE controle_id = NEW.controle_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Numero global de vale ja utilizado por lancamento';
  END IF;
END$$
DELIMITER ;
