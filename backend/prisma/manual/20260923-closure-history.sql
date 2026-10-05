-- Additive migration: preserves every existing closure and its totals.
ALTER TABLE `frete_fechamentos` ADD COLUMN `historico` JSON NULL;
