ALTER TABLE frete_lancamentos
  ADD COLUMN cancelado TINYINT(1) NOT NULL DEFAULT 0 AFTER emitido_em,
  ADD COLUMN cancelado_em DATETIME NULL AFTER cancelado,
  ADD COLUMN cancelado_por INT NULL AFTER cancelado_em,
  ADD INDEX idx_frete_lancamento_cancelado (cancelado);
