-- Desativação lógica de motoristas, preservando todo o histórico existente.
ALTER TABLE `driver`
  ADD COLUMN `canceled` BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX `idx_driver_canceled` ON `driver` (`canceled`);
