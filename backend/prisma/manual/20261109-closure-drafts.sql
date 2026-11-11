CREATE TABLE IF NOT EXISTS `frete_fechamento_rascunhos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `semana` CHAR(4) NOT NULL,
  `placa` VARCHAR(20) NOT NULL,
  `unit` INT NOT NULL,
  `debit_entry_ids` JSON NOT NULL,
  `coupon_ids` JSON NOT NULL,
  `responsavel_cod` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_frete_fechamento_rascunho_semana_placa` (`semana`, `placa`),
  KEY `idx_frete_fechamento_rascunho_unit_semana` (`unit`, `semana`),
  KEY `idx_frete_fechamento_rascunho_responsavel` (`responsavel_cod`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
