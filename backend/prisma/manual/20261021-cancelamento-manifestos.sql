ALTER TABLE `frete_carregamento_manifestos`
  ADD COLUMN IF NOT EXISTS `cancelado` BOOLEAN NOT NULL DEFAULT FALSE AFTER `vale_pedagio`,
  ADD COLUMN IF NOT EXISTS `cancelado_em` DATETIME NULL AFTER `cancelado`,
  ADD COLUMN IF NOT EXISTS `cancelado_por` INT NULL AFTER `cancelado_em`;

CREATE INDEX `idx_frete_manifesto_cancelado`
  ON `frete_carregamento_manifestos` (`cancelado`);
