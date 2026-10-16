-- O cadastro legado de unidades já existe em `branches` (unit + branch).
-- Esta alteração é aditiva e preserva todas as unidades atuais.
ALTER TABLE `branches`
  ADD COLUMN IF NOT EXISTS `dominio` VARCHAR(4) NULL AFTER `branch`;

CREATE INDEX IF NOT EXISTS `idx_branches_dominio` ON `branches` (`dominio`);
