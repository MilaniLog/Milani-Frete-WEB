-- Permite cadastrar vales antes da criação do manifesto e vinculá-los depois.
ALTER TABLE `frete_lancamentos`
  ADD COLUMN IF NOT EXISTS `manifesto_numero` VARCHAR(20) NULL AFTER `manifesto_id`;

CREATE INDEX IF NOT EXISTS `idx_frete_lancamento_manifesto_numero`
  ON `frete_lancamentos` (`unit`, `manifesto_numero`);
